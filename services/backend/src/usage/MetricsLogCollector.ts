import { open, stat } from "node:fs/promises";
import type { Logger } from "../observability/requestLogging";
import { parseMetricLine } from "./metricsLog";
import type { IUsageRepository, LogCursor } from "./UsageRepository";

export interface CollectorOptions {
  /** How often to check the file for new lines. */
  intervalMs?: number;
  /** Most bytes read per check, so a big backlog is worked through in steps. */
  chunkBytes?: number;
  log?: Logger;
}

/**
 * Follows WSO2's apim_metrics.log and stores each call as a usage event.
 *
 * Only whole lines are consumed: a line still being written is read again
 * next time. The read position is saved, so a restart carries on where it
 * stopped; a smaller file or a new inode means the log rotated, and reading
 * starts again from the top. Events are unique by correlation id, so reading
 * something twice never double-counts.
 */
export class MetricsLogCollector {
  private cursor: LogCursor | null = null;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly intervalMs: number;
  private readonly chunkBytes: number;

  constructor(
    private readonly file: string,
    private readonly usage: IUsageRepository,
    private readonly options: CollectorOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 5_000;
    this.chunkBytes = options.chunkBytes ?? 1_048_576;
  }

  start(): void {
    this.timer ??= setInterval(() => {
      void this.poll();
    }, this.intervalMs);
    this.timer.unref();
    void this.poll();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Reads everything new in the file. Returns how many events were found. */
  async poll(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let found = 0;
      for (;;) {
        const n = await this.readChunk();
        if (n === null) break;
        found += n;
      }
      return found;
    } catch (err) {
      this.options.log?.({
        level: "error",
        msg: "Usage collector failed",
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** One chunk: the number of events stored, or null when there's nothing more to read. */
  private async readChunk(): Promise<number | null> {
    let info;
    try {
      info = await stat(this.file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    const ino = String(info.ino);
    this.cursor ??= await this.usage.getCursor(this.file);
    let offset = this.cursor && this.cursor.ino === ino && this.cursor.offset <= info.size ? this.cursor.offset : 0;
    if (offset >= info.size) {
      if (!this.cursor || this.cursor.ino !== ino || this.cursor.offset !== offset) {
        await this.save({ ino, offset });
      }
      return null;
    }

    const length = Math.min(this.chunkBytes, info.size - offset);
    const buffer = Buffer.alloc(length);
    const handle = await open(this.file, "r");
    try {
      await handle.read(buffer, 0, length, offset);
    } finally {
      await handle.close();
    }

    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline === -1) {
      // A single line longer than a chunk can't be a metrics event; skip it.
      if (length === this.chunkBytes) {
        await this.save({ ino, offset: offset + length });
        return 0;
      }
      return null; // The rest of the line hasn't been written yet.
    }

    const events = buffer
      .subarray(0, lastNewline)
      .toString("utf8")
      .split("\n")
      .map(parseMetricLine)
      .filter((e) => e !== null);
    await this.usage.insertMany(events);
    offset += lastNewline + 1;
    await this.save({ ino, offset });
    return events.length;
  }

  private async save(cursor: LogCursor): Promise<void> {
    this.cursor = cursor;
    await this.usage.saveCursor(this.file, cursor);
  }
}

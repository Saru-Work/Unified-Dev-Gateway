import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface LogEntry {
  level: "info" | "warn" | "error";
  msg: string;
  requestId?: string;
  [field: string]: unknown;
}

export type Logger = (entry: LogEntry) => void;

/** Writes one JSON object per line, so logs can be parsed by any collector. */
export const jsonLogger: Logger = (entry) => {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  if (entry.level === "error") console.error(line);
  else console.log(line);
};

// Accept a caller's id only if it's short and plain, so it's safe to log and echo.
const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

/**
 * Gives every request an id (the caller's X-Request-Id if it's safe, else a
 * UUID), echoes it in the response header, and logs one line when the
 * response finishes. The query string is left out of the log because it can
 * carry search terms or ids.
 */
export function requestLogging(log: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.get("x-request-id");
    const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      log({
        level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        msg: "request",
        requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      });
    });
    next();
  };
}

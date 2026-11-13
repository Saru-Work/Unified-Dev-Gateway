import type { RequestHandler } from "express";
import type { Logger } from "./requestLogging";

/** Resolves when a dependency is usable, rejects otherwise. */
export type ReadinessCheck = () => Promise<void>;

const CHECK_TIMEOUT_MS = 3_000;

function withTimeout(check: ReadinessCheck): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), CHECK_TIMEOUT_MS);
  });
  return Promise.race([check(), timeout]).finally(() => clearTimeout(timer));
}

/**
 * GET /ready: runs every check in parallel. 200 when all pass, otherwise 503
 * naming the failed ones. Failure reasons are logged, not returned, since
 * the endpoint is unauthenticated.
 */
export function readinessHandler(
  checks: Record<string, ReadinessCheck>,
  log: Logger,
): RequestHandler {
  return async (_req, res) => {
    const names = Object.keys(checks);
    const results = await Promise.allSettled(names.map((name) => withTimeout(checks[name]!)));

    const report: Record<string, "ok" | "failed"> = {};
    results.forEach((result, i) => {
      const name = names[i]!;
      report[name] = result.status === "fulfilled" ? "ok" : "failed";
      if (result.status === "rejected") {
        log({
          level: "warn",
          msg: "Readiness check failed",
          requestId: res.locals.requestId as string | undefined,
          check: name,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    const ready = results.every((r) => r.status === "fulfilled");
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not ready", checks: report });
  };
}

import { isAxiosError } from "axios";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./AppError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Pass upstream WSO2 errors through with their status, without leaking internals.
  if (isAxiosError(err) && err.response) {
    return res.status(err.response.status).json({
      message: "WSO2 request failed",
      details: err.response.data,
    });
  }
  if (isAxiosError(err)) {
    console.error("WSO2 unreachable:", err.message);
    return res.status(502).json({ message: "WSO2 is unreachable" });
  }

  // Client errors raised by middleware (e.g. body-parser's malformed JSON / too large).
  if (
    err instanceof Error &&
    "expose" in err &&
    err.expose === true &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  ) {
    return res.status(err.status).json({ message: err.message });
  }

  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
}

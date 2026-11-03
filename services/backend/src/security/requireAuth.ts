import type { NextFunction, Request, Response } from "express";
import type { UserTokenService } from "./UserTokenService";
import { AppError } from "../errors/AppError";

/** Verifies the OpenGate bearer token and stores the user id in res.locals.userId. */
export function requireAuth(tokens: UserTokenService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization");
    const match = header?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      throw new AppError(401, "Missing bearer token");
    }
    try {
      res.locals.userId = await tokens.verify(match[1]);
    } catch {
      throw new AppError(401, "Invalid or expired token");
    }
    next();
  };
}

import type { Request } from "express";
import { AppError } from "../errors/AppError";

/** Reads the WSO2 token the client forwards in X-WSO2-Authorization, or 401s. */
export function requireWso2Authorization(req: Request): string {
  const value = req.get("x-wso2-authorization");
  if (!value) {
    throw new AppError(
      401,
      "Provide a WSO2 bearer token in the X-WSO2-Authorization header",
    );
  }
  return value;
}

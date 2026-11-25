import { Router } from "express";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "../errors/AppError";
import type { AuthController } from "../controllers/AuthController";

/** Sends 429s through the error handler, so they're JSON like every other error. */
const tooManyRequests: RequestHandler = (_req, _res, next) => {
  next(new AppError(429, "Too many requests. Try again later."));
};

export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
) {
  const router = Router();
  // Slow down credential stuffing / brute force on the public endpoints.
  const credentialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooManyRequests,
  });

  // Refresh tokens are 256 random bits, so this only caps runaway clients.
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooManyRequests,
  });

  router.post("/register", credentialLimiter, controller.register);
  router.post("/login", credentialLimiter, controller.login);
  router.post("/refresh", refreshLimiter, controller.refresh);
  router.post("/logout", refreshLimiter, controller.logout);
  router.get("/me", authenticate, controller.me);
  // Rate-limited too: it's another way to test guesses of the current password.
  router.post("/password", authenticate, credentialLimiter, controller.changePassword);
  return router;
}

import { Router } from "express";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import type { AuthController } from "../controllers/AuthController";

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
  });

  router.post("/register", credentialLimiter, controller.register);
  router.post("/login", credentialLimiter, controller.login);
  router.get("/me", authenticate, controller.me);
  // Rate-limited too: it's another way to test guesses of the current password.
  router.post("/password", authenticate, credentialLimiter, controller.changePassword);
  return router;
}

import { Router } from "express";
import type { RequestHandler } from "express";
import type { ApplicationController } from "../controllers/ApplicationController";

export function createApplicationRouter(
  controller: ApplicationController,
  authenticate: RequestHandler,
) {
  const router = Router();
  router.post("/", authenticate, controller.create);
  return router;
}

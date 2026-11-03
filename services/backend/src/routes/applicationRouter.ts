import { Router } from "express";
import type { RequestHandler } from "express";
import type { ApplicationController } from "../controllers/ApplicationController";

export function createApplicationRouter(
  controller: ApplicationController,
  authenticate: RequestHandler,
) {
  const router = Router();
  router.use(authenticate);
  router.post("/", controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  return router;
}

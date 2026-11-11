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
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.delete);
  router.get("/:id/keys", controller.listKeys);
  router.post("/:id/keys", controller.generateKeys);
  router.get("/:id/subscriptions", controller.listSubscriptions);
  router.post("/:id/subscriptions", controller.subscribe);
  router.delete("/:id/subscriptions/:subscriptionId", controller.unsubscribe);
  return router;
}

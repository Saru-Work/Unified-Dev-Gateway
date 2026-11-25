import { Router } from "express";
import type { RequestHandler } from "express";
import type { Wso2Transport } from "../integrations/wso2/client";
import type { ISavedApiRepository } from "../repositories/SavedApiRepository";

export function createSavedApiRouter(
  saved: ISavedApiRepository,
  wso2: Wso2Transport,
  authenticate: RequestHandler,
) {
  const router = Router();
  router.use(authenticate);

  router.get("/", async (_req, res) => {
    res.json({ apis: await saved.list(res.locals.userId as string) });
  });

  router.put("/:apiId", async (req, res) => {
    // Only published, public APIs can be saved: WSO2's 404 passes through.
    await wso2.get(`/apis/${encodeURIComponent(req.params.apiId)}`);
    await saved.save(res.locals.userId as string, req.params.apiId);
    res.status(204).end();
  });

  // No WSO2 check, so an API that's since been retired can still be removed.
  router.delete("/:apiId", async (req, res) => {
    await saved.remove(res.locals.userId as string, req.params.apiId);
    res.status(204).end();
  });

  return router;
}

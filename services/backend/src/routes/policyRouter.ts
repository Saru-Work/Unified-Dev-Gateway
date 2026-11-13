import { Router } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { requireWso2Authorization } from "../security/wso2Authorization";
import { POLICY_LEVELS, type PolicyLevel, type PolicyService } from "../services/PolicyService";

export function createPolicyRouter(service: PolicyService, authenticate: RequestHandler) {
  const router = Router();
  router.use(authenticate);
  router.get("/:level", async (req, res) => {
    const level = req.params.level as PolicyLevel;
    if (!POLICY_LEVELS.includes(level)) {
      throw new AppError(404, `Policy level must be one of ${POLICY_LEVELS.join(", ")}`);
    }
    const policies = await service.list(level, requireWso2Authorization(req));
    res.json({ policies });
  });
  return router;
}

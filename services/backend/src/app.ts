import express from "express";
import type { Wso2Transport } from "./integrations/wso2/client";
import type { IUserRepository } from "./repositories/UserRepository";
import type { IApplicationRepository } from "./repositories/ApplicationRepository";
import type { PasswordHasher } from "./security/PasswordHasher";
import type { UserTokenService } from "./security/UserTokenService";
import { requireAuth } from "./security/requireAuth";
import { AuthService } from "./services/AuthService";
import { Wso2ApplicationService } from "./services/Wso2ApplicationService";
import { SubscriptionService } from "./services/SubscriptionService";
import { AuthController } from "./controllers/AuthController";
import { ApplicationController } from "./controllers/ApplicationController";
import { createAuthRouter } from "./routes/authRouter";
import { createApplicationRouter } from "./routes/applicationRouter";
import { errorHandler } from "./errors/errorHandler";

export interface AppDependencies {
  users: IUserRepository;
  applications: IApplicationRepository;
  passwords: PasswordHasher;
  tokens: UserTokenService;
  wso2: Wso2Transport;
}

/** Builds the Express app from its dependencies, so tests can inject fakes. */
export function createApp(deps: AppDependencies) {
  const authenticate = requireAuth(deps.tokens);
  const authController = new AuthController(
    new AuthService(deps.users, deps.passwords, deps.tokens),
  );
  const applicationService = new Wso2ApplicationService(deps.wso2, deps.applications);
  const appController = new ApplicationController(
    applicationService,
    new SubscriptionService(deps.wso2, applicationService),
  );

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/apis", async (_req, res) => {
    const result = await deps.wso2.get("/apis");
    res.status(result.status).json(result.data);
  });

  app.get("/apis/:id", async (req, res) => {
    const result = await deps.wso2.get(`/apis/${encodeURIComponent(req.params.id)}`);
    res.status(result.status).json(result.data);
  });

  app.use("/auth", createAuthRouter(authController, authenticate));
  app.use("/applications", createApplicationRouter(appController, authenticate));

  app.use(errorHandler);
  return app;
}

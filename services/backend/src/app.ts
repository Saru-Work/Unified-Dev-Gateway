import express from "express";
import type { Wso2Transport } from "./integrations/wso2/client";
import {
  RetryWithFreshToken,
  type Wso2TokenSource,
} from "./integrations/wso2/Wso2TokenProvider";
import type { IUserRepository } from "./repositories/UserRepository";
import type { IApplicationRepository } from "./repositories/ApplicationRepository";
import type { ISavedApiRepository } from "./repositories/SavedApiRepository";
import type { PasswordHasher } from "./security/PasswordHasher";
import type { UserTokenService } from "./security/UserTokenService";
import type { IRefreshTokenRepository } from "./repositories/RefreshTokenRepository";
import {
  RefreshTokenService,
  type RefreshTokenOptions,
} from "./security/RefreshTokenService";
import { requireAuth } from "./security/requireAuth";
import { AuthService } from "./services/AuthService";
import { Wso2ApplicationService } from "./services/Wso2ApplicationService";
import { SubscriptionService } from "./services/SubscriptionService";
import { PolicyService } from "./services/PolicyService";
import { UsageService } from "./services/UsageService";
import { AuthController } from "./controllers/AuthController";
import { ApplicationController } from "./controllers/ApplicationController";
import { createAuthRouter } from "./routes/authRouter";
import { createApplicationRouter } from "./routes/applicationRouter";
import { createSavedApiRouter } from "./routes/savedApiRouter";
import { createPolicyRouter } from "./routes/policyRouter";
import { openApiDocument } from "./openapi";
import { toOperations } from "./services/apiOperations";
import type { IUsageRepository } from "./usage/UsageRepository";
import { cached } from "./usage/cached";
import { apiHealth, HEALTH_WINDOW_HOURS } from "./usage/health";
import { createErrorHandler } from "./errors/errorHandler";
import { AppError } from "./errors/AppError";
import { readinessHandler, type ReadinessCheck } from "./observability/readiness";
import { jsonLogger, requestLogging, type Logger } from "./observability/requestLogging";

export interface AppDependencies {
  users: IUserRepository;
  applications: IApplicationRepository;
  savedApis: ISavedApiRepository;
  passwords: PasswordHasher;
  tokens: UserTokenService;
  refreshTokens: IRefreshTokenRepository;
  /** Lifetimes and clock for refresh tokens (defaults: 30 days, 30s reuse grace). */
  refreshTokenOptions?: RefreshTokenOptions;
  wso2: Wso2Transport;
  /** OpenGate's own WSO2 token, used for every call that acts in WSO2. */
  wso2Token: Wso2TokenSource;
  /** Per-application usage, when the gateway's metrics log is collected. */
  usage?: IUsageRepository;
  /** Where request and error logs go; JSON lines on stdout/stderr by default. */
  log?: Logger;
  /** Dependency checks behind GET /ready, e.g. { mongo, wso2 }. */
  readinessChecks?: Record<string, ReadinessCheck>;
  /** Trusted proxy hops, so rate limits see the client's address (see config). */
  trustProxy?: number;
}

/** How long results computed across every application are reused. */
const INSIGHTS_CACHE_MS = 30_000;
const POPULAR_DAYS = 30;
const POPULAR_LIMIT = 100;

/** Builds the Express app from its dependencies, so tests can inject fakes. */
export function createApp(deps: AppDependencies) {
  const authenticate = requireAuth(deps.tokens);
  const wso2 = new RetryWithFreshToken(deps.wso2, deps.wso2Token);
  const authController = new AuthController(
    new AuthService(
      deps.users,
      deps.passwords,
      deps.tokens,
      new RefreshTokenService(deps.refreshTokens, deps.refreshTokenOptions),
    ),
  );
  const applicationService = new Wso2ApplicationService(wso2, deps.applications);
  const appController = new ApplicationController(
    applicationService,
    new SubscriptionService(wso2, applicationService),
    deps.wso2Token,
    deps.usage && new UsageService(deps.usage),
  );

  const log = deps.log ?? jsonLogger;
  const app = express();
  app.disable("x-powered-by");
  if (deps.trustProxy !== undefined) app.set("trust proxy", deps.trustProxy);
  app.use(requestLogging(log));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });

  app.get("/ready", readinessHandler(deps.readinessChecks ?? {}, log));

  app.get("/apis", async (req, res) => {
    // WSO2 returns 25 APIs unless asked for more; let callers page through them.
    const query = new URLSearchParams();
    for (const [name, max] of [["limit", 1000], ["offset", Number.MAX_SAFE_INTEGER]] as const) {
      const raw = req.query[name];
      if (raw === undefined) continue;
      const value = Number(raw);
      if (typeof raw !== "string" || !Number.isInteger(value) || value < 0 || value > max) {
        throw new AppError(400, `${name} must be a whole number from 0 to ${max}`);
      }
      query.set(name, String(value));
    }
    const result = await deps.wso2.get(query.size ? `/apis?${query}` : "/apis");
    res.status(result.status).json(result.data);
  });

  const { usage } = deps;
  const health = usage && cached(() => apiHealth(usage, new Date()), INSIGHTS_CACHE_MS);
  app.get("/apis/health", async (_req, res) => {
    if (!health) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, windowHours: HEALTH_WINDOW_HOURS, apis: await health() });
  });

  const popular =
    usage &&
    cached(() => {
      const now = new Date();
      return usage.popularApis(new Date(now.getTime() - POPULAR_DAYS * 86_400_000), now, POPULAR_LIMIT);
    }, INSIGHTS_CACHE_MS);
  app.get("/apis/popular", async (_req, res) => {
    if (!popular) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, days: POPULAR_DAYS, apis: await popular() });
  });

  app.get("/apis/:id", async (req, res) => {
    const result = await deps.wso2.get(`/apis/${encodeURIComponent(req.params.id)}`);
    res.status(result.status).json(result.data);
  });

  app.get("/apis/:id/operations", async (req, res) => {
    const result = await deps.wso2.get(`/apis/${encodeURIComponent(req.params.id)}/swagger`);
    res.json({ operations: toOperations(result.data) });
  });

  app.use("/auth", createAuthRouter(authController, authenticate));
  app.use("/applications", createApplicationRouter(appController, authenticate));
  app.get("/usage", authenticate, appController.accountUsage);
  app.use("/saved-apis", createSavedApiRouter(deps.savedApis, deps.wso2, authenticate));
  app.use(
    "/throttling-policies",
    createPolicyRouter(new PolicyService(wso2), authenticate, deps.wso2Token),
  );

  app.use(createErrorHandler(log));
  return app;
}

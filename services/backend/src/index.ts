import express from "express";
import mongoose from "mongoose";
import { loadConfig } from "./config";
import { Wso2Client } from "./integrations/wso2/client";
import { UserRepository } from "./repositories/UserRepository";
import { PasswordHasher } from "./security/PasswordHasher";
import { UserTokenService } from "./security/UserTokenService";
import { requireAuth } from "./security/requireAuth";
import { AuthService } from "./services/AuthService";
import { Wso2ApplicationService } from "./services/Wso2ApplicationService";
import { AuthController } from "./controllers/AuthController";
import { ApplicationController } from "./controllers/ApplicationController";
import { createAuthRouter } from "./routes/authRouter";
import { createApplicationRouter } from "./routes/applicationRouter";
import { errorHandler } from "./errors/errorHandler";

async function main() {
  const config = loadConfig();

  await mongoose.connect(config.mongoUri);
  console.log("Connected to MongoDB");

  const wso2Client = new Wso2Client(
    config.wso2BaseUrl,
    config.wso2AllowSelfSigned,
  );
  const tokens = new UserTokenService(config.jwtSecret);
  const authenticate = requireAuth(tokens);

  const authController = new AuthController(
    new AuthService(new UserRepository(), new PasswordHasher(), tokens),
  );
  const appController = new ApplicationController(
    new Wso2ApplicationService(wso2Client),
  );

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/apis", async (_req, res) => {
    const result = await wso2Client.get("/apis");
    res.status(result.status).json(result.data);
  });

  app.use("/auth", createAuthRouter(authController, authenticate));
  app.use("/applications", createApplicationRouter(appController, authenticate));

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`OpenGate backend is running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});

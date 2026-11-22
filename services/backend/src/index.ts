import { isAxiosError } from "axios";
import mongoose from "mongoose";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { Wso2Client } from "./integrations/wso2/client";
import { Wso2TokenProvider } from "./integrations/wso2/Wso2TokenProvider";
import { jsonLogger } from "./observability/requestLogging";
import { UserRepository } from "./repositories/UserRepository";
import { ApplicationRepository } from "./repositories/ApplicationRepository";
import { PasswordHasher } from "./security/PasswordHasher";
import { UserTokenService } from "./security/UserTokenService";

async function main() {
  const config = loadConfig();

  await mongoose.connect(config.mongoUri);
  console.log("Connected to MongoDB");

  const wso2 = new Wso2Client(config.wso2BaseUrl, config.wso2AllowSelfSigned);
  const wso2Token = new Wso2TokenProvider({
    origin: new URL(config.wso2BaseUrl).origin,
    username: config.wso2Username,
    password: config.wso2Password,
    clientId: config.wso2ClientId,
    clientSecret: config.wso2ClientSecret,
    allowSelfSigned: config.wso2AllowSelfSigned,
    log: (msg, error) => jsonLogger({ level: "error", msg, error }),
  });

  const app = createApp({
    users: new UserRepository(),
    applications: new ApplicationRepository(),
    passwords: new PasswordHasher(),
    tokens: new UserTokenService(config.jwtSecret),
    wso2,
    wso2Token,
    readinessChecks: {
      mongo: async () => {
        const db = mongoose.connection.db;
        if (!db) throw new Error("not connected");
        await db.admin().ping();
      },
      // Any HTTP answer, even a 401, means WSO2 is up and reachable.
      wso2: () =>
        wso2.get("/apis?limit=1").then(
          () => undefined,
          (err: unknown) => {
            if (isAxiosError(err) && err.response) return;
            throw err;
          },
        ),
    },
  });

  app.listen(config.port, () => {
    console.log(`OpenGate backend is running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});

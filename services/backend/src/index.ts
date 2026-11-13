import { isAxiosError } from "axios";
import mongoose from "mongoose";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { Wso2Client } from "./integrations/wso2/client";
import { UserRepository } from "./repositories/UserRepository";
import { ApplicationRepository } from "./repositories/ApplicationRepository";
import { PasswordHasher } from "./security/PasswordHasher";
import { UserTokenService } from "./security/UserTokenService";

async function main() {
  const config = loadConfig();

  await mongoose.connect(config.mongoUri);
  console.log("Connected to MongoDB");

  const wso2 = new Wso2Client(config.wso2BaseUrl, config.wso2AllowSelfSigned);

  const app = createApp({
    users: new UserRepository(),
    applications: new ApplicationRepository(),
    passwords: new PasswordHasher(),
    tokens: new UserTokenService(config.jwtSecret),
    wso2,
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

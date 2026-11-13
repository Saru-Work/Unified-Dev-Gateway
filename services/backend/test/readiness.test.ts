import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app";
import type { LogEntry } from "../src/observability/requestLogging";
import type { ReadinessCheck } from "../src/observability/readiness";
import { UserTokenService } from "../src/security/UserTokenService";
import {
  FakeWso2,
  InMemoryApplicationRepository,
  InMemoryUserRepository,
  TEST_SECRET,
  fakeHasher,
  startTestServer,
} from "./helpers";

async function serve(readinessChecks: Record<string, ReadinessCheck>) {
  const logs: LogEntry[] = [];
  const app = createApp({
    users: new InMemoryUserRepository(),
    applications: new InMemoryApplicationRepository(),
    passwords: fakeHasher,
    tokens: new UserTokenService(TEST_SECRET),
    wso2: new FakeWso2(),
    log: (entry) => logs.push(entry),
    readinessChecks,
  });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as import("node:net").AddressInfo;
  return {
    logs,
    get: async () => {
      const res = await fetch(`http://127.0.0.1:${port}/ready`);
      return { status: res.status, body: await res.json() };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("GET /ready", () => {
  const servers: { close(): Promise<void> }[] = [];
  after(() => Promise.all(servers.map((s) => s.close())));

  it("is ready when every check passes", async () => {
    const s = await serve({ mongo: async () => {}, wso2: async () => {} });
    servers.push(s);
    assert.deepEqual(await s.get(), {
      status: 200,
      body: { status: "ready", checks: { mongo: "ok", wso2: "ok" } },
    });
  });

  it("is not ready when a check fails, and logs why without returning it", async () => {
    const s = await serve({
      mongo: async () => {},
      wso2: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:9443");
      },
    });
    servers.push(s);

    const res = await s.get();

    assert.deepEqual(res, {
      status: 503,
      body: { status: "not ready", checks: { mongo: "ok", wso2: "failed" } },
    });
    const entry = s.logs.find((e) => e.msg === "Readiness check failed");
    assert.equal(entry?.check, "wso2");
    assert.match(String(entry?.error), /ECONNREFUSED/);
  });

  it("is ready with no checks configured", async () => {
    const server = await startTestServer();
    servers.push(server);
    const res = await server.get("/ready");
    assert.deepEqual(res, { status: 200, body: { status: "ready", checks: {} } });
  });
});

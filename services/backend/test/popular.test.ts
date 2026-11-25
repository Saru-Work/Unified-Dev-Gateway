import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryUsageRepository, startTestServer, type TestServer } from "./helpers";

describe("GET /apis/popular", () => {
  let server: TestServer;
  before(async () => {
    const usage = new InMemoryUsageRepository();
    let n = 0;
    const call = (apiId: string, app: string, status = 200, daysAgo = 1) =>
      usage.insertMany([
        {
          correlationId: String(n++),
          timestamp: new Date(Date.now() - daysAgo * 86_400_000),
          wso2ApplicationId: app,
          apiId,
          apiName: apiId,
          status,
        },
      ]);
    for (let i = 0; i < 10; i++) await call("busy", "one-app");
    await call("wide", "app-1");
    await call("wide", "app-2");
    await call("quiet", "app-1");
    await call("failing", "app-1", 500);
    await call("forgotten", "app-1", 200, 31);
    server = await startTestServer({ usage });
  });
  after(() => server.close());

  it("ranks by applications, then calls, ignoring failures and old calls", async () => {
    const res = await server.get("/apis/popular");
    assert.deepEqual(res.body, {
      enabled: true,
      days: 30,
      apis: [
        { apiId: "wide", applications: 2 },
        { apiId: "busy", applications: 1 },
        { apiId: "quiet", applications: 1 },
      ],
    });
  });

  it("says when usage isn't being collected", async () => {
    const plain = await startTestServer();
    try {
      assert.deepEqual((await plain.get("/apis/popular")).body, { enabled: false });
    } finally {
      await plain.close();
    }
  });
});

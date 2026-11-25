import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cached } from "../src/usage/cached";
import { toHealth } from "../src/usage/health";
import { InMemoryUsageRepository, startTestServer, type TestServer } from "./helpers";

describe("toHealth", () => {
  const status = (calls: number, serverErrors: number) => toHealth({ apiId: "a", calls, serverErrors }).status;

  it("grades by the share of server errors", () => {
    assert.equal(status(100, 4), "operational");
    assert.equal(status(100, 5), "degraded");
    assert.equal(status(100, 49), "degraded");
    assert.equal(status(100, 50), "down");
  });

  it("doesn't judge on a handful of calls", () => {
    assert.deepEqual(toHealth({ apiId: "a", calls: 4, serverErrors: 4, avgLatencyMs: 10 }), {
      apiId: "a",
      status: "unknown",
    });
  });
});

describe("cached", () => {
  it("reuses a result until it expires", async () => {
    let now = 0;
    let loads = 0;
    const get = cached(async () => ++loads, 100, () => now);
    assert.equal(await get(), 1);
    now = 99;
    assert.equal(await get(), 1);
    now = 100;
    assert.equal(await get(), 2);
  });

  it("doesn't keep failures", async () => {
    let loads = 0;
    const get = cached(async () => {
      if (++loads === 1) throw new Error("boom");
      return loads;
    }, 100, () => 0);
    await assert.rejects(get(), /boom/);
    assert.equal(await get(), 2);
  });
});

describe("GET /apis/health", () => {
  let server: TestServer;
  before(async () => {
    const usage = new InMemoryUsageRepository();
    const add = (id: string, apiId: string, status: number, hoursAgo = 1) =>
      usage.insertMany([
        {
          correlationId: id,
          timestamp: new Date(Date.now() - hoursAgo * 3_600_000),
          wso2ApplicationId: `app-${id}`,
          apiId,
          apiName: apiId,
          status,
          latencyMs: 100,
        },
      ]);
    for (let i = 0; i < 10; i++) {
      await add(`ok-${i}`, "good", i < 5 ? 429 : 200);
      await add(`bad-${i}`, "bad", 503);
      await add(`old-${i}`, "recovered", 503, 10);
    }
    server = await startTestServer({ usage });
  });
  after(() => server.close());

  it("is public, covers every application, and blames APIs only for 5xx", async () => {
    const res = await server.get("/apis/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      enabled: true,
      windowHours: 6,
      apis: [
        { apiId: "bad", status: "down", successRate: 0, avgLatencyMs: 100 },
        { apiId: "good", status: "operational", successRate: 1, avgLatencyMs: 100 },
      ],
    });
    assert.equal(server.wso2.calls.length, 0);
  });

  it("says when usage isn't being collected", async () => {
    const plain = await startTestServer();
    try {
      assert.deepEqual((await plain.get("/apis/health")).body, { enabled: false });
    } finally {
      await plain.close();
    }
  });
});

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers";

const WSO2 = { "x-wso2-authorization": "Bearer wso2-token" };

describe("GET /throttling-policies/:level", () => {
  let server: TestServer;
  let alice: Record<string, string>;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
  });

  it("requires an OpenGate token", async () => {
    const res = await server.get("/throttling-policies/application", WSO2);
    assert.equal(res.status, 401);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("requires a WSO2 token", async () => {
    const res = await server.get("/throttling-policies/application", alice);
    assert.equal(res.status, 401);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("rejects an unknown level without calling WSO2", async () => {
    const res = await server.get("/throttling-policies/advanced", { ...alice, ...WSO2 });
    assert.equal(res.status, 404);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("lists the policies with only known fields", async () => {
    server.wso2.respond = () => ({
      status: 200,
      data: {
        count: 3,
        list: [
          {
            name: "10PerMin",
            displayName: "10PerMin",
            description: "Allows 10 requests per minute",
            policyLevel: "application",
            requestCount: 10,
            unitTime: 1,
            timeUnit: "min",
            monetizationAttributes: { secret: true },
          },
          { name: "Unlimited", requestCount: 2147483647 },
          { description: "no name, dropped" },
        ],
      },
    });

    const res = await server.get("/throttling-policies/application", { ...alice, ...WSO2 });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.policies, [
      {
        name: "10PerMin",
        displayName: "10PerMin",
        description: "Allows 10 requests per minute",
        requestCount: 10,
        unitTime: 1,
        timeUnit: "min",
      },
      { name: "Unlimited", requestCount: 2147483647 },
    ]);
    assert.deepEqual(server.wso2.calls, [
      {
        method: "GET",
        path: "/throttling-policies/application",
        authorization: "Bearer wso2-token",
      },
    ]);
  });

  it("supports the subscription level", async () => {
    server.wso2.respond = () => ({ status: 200, data: { list: [{ name: "Gold" }] } });
    const res = await server.get("/throttling-policies/subscription", { ...alice, ...WSO2 });
    assert.deepEqual(res.body, { policies: [{ name: "Gold" }] });
    assert.equal(server.wso2.calls[0]?.path, "/throttling-policies/subscription");
  });
});

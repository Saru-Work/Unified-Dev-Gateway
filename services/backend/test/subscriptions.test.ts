import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers";

const WSO2 = { "x-wso2-authorization": "Bearer wso2-token" };

const WSO2_SUBSCRIPTION = {
  subscriptionId: "sub-1",
  applicationId: "wso2-app",
  apiId: "api-1",
  apiInfo: { name: "Pets", version: "1.0.0", context: "/pets/1.0.0", provider: "admin" },
  throttlingPolicy: "Gold",
  status: "UNBLOCKED",
  requestedThrottlingPolicy: "Gold",
};

describe("subscriptions", () => {
  let server: TestServer;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let appId: string;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
  });
  after(() => server.close());
  beforeEach(async () => {
    server.applications.records.length = 0;
    server.wso2.respond = () => ({ status: 201, data: { applicationId: "wso2-app" } });
    const { body } = await server.post("/applications", { name: "app" }, { ...alice, ...WSO2 });
    appId = body.application.id;
    server.wso2.calls.length = 0;
  });

  const expected = {
    subscriptionId: "sub-1",
    apiId: "api-1",
    apiName: "Pets",
    apiVersion: "1.0.0",
    apiContext: "/pets/1.0.0",
    throttlingPolicy: "Gold",
    status: "UNBLOCKED",
  };

  describe("GET /applications/:id/subscriptions", () => {
    it("lists the app's subscriptions from WSO2", async () => {
      server.wso2.respond = () => ({ status: 200, data: { count: 1, list: [WSO2_SUBSCRIPTION] } });

      const res = await server.get(`/applications/${appId}/subscriptions`, { ...alice, ...WSO2 });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { subscriptions: [expected] });
      assert.deepEqual(server.wso2.calls, [
        {
          method: "GET",
          path: "/subscriptions?applicationId=wso2-app",
          authorization: "Bearer wso2-token",
        },
      ]);
    });

    it("requires a WSO2 token", async () => {
      const res = await server.get(`/applications/${appId}/subscriptions`, alice);
      assert.equal(res.status, 401);
    });

    it("returns 404 for another user's app", async () => {
      const res = await server.get(`/applications/${appId}/subscriptions`, { ...bob, ...WSO2 });
      assert.equal(res.status, 404);
      assert.equal(server.wso2.calls.length, 0);
    });
  });

  describe("POST /applications/:id/subscriptions", () => {
    const subscribe = (body: unknown, headers = alice) =>
      server.post(`/applications/${appId}/subscriptions`, body, { ...headers, ...WSO2 });

    it("requires an apiId", async () => {
      const res = await subscribe({});
      assert.equal(res.status, 400);
      assert.equal(server.wso2.calls.length, 0);
    });

    it("subscribes with the Unlimited tier by default", async () => {
      server.wso2.respond = () => ({ status: 201, data: WSO2_SUBSCRIPTION });

      const res = await subscribe({ apiId: "api-1" });

      assert.equal(res.status, 201);
      assert.deepEqual(res.body.subscription, expected);
      assert.deepEqual(server.wso2.calls[0]?.body, {
        applicationId: "wso2-app",
        apiId: "api-1",
        throttlingPolicy: "Unlimited",
      });
    });

    it("uses the requested tier", async () => {
      server.wso2.respond = () => ({ status: 201, data: WSO2_SUBSCRIPTION });
      await subscribe({ apiId: "api-1", throttlingPolicy: "Gold" });
      assert.equal(
        (server.wso2.calls[0]?.body as { throttlingPolicy: string }).throttlingPolicy,
        "Gold",
      );
    });

    it("returns 404 for another user's app without calling WSO2", async () => {
      const res = await subscribe({ apiId: "api-1" }, bob);
      assert.equal(res.status, 404);
      assert.equal(server.wso2.calls.length, 0);
    });
  });

  describe("DELETE /applications/:id/subscriptions/:subscriptionId", () => {
    const unsubscribe = (subscriptionId: string, headers = alice) =>
      server.delete(`/applications/${appId}/subscriptions/${subscriptionId}`, {
        ...headers,
        ...WSO2,
      });

    it("checks the subscription belongs to the app, then deletes it", async () => {
      server.wso2.respond = (call) =>
        call.method === "GET"
          ? { status: 200, data: WSO2_SUBSCRIPTION }
          : { status: 200, data: {} };

      const res = await unsubscribe("sub-1");

      assert.equal(res.status, 204);
      assert.deepEqual(
        server.wso2.calls.map((c) => [c.method, c.path]),
        [
          ["GET", "/subscriptions/sub-1"],
          ["DELETE", "/subscriptions/sub-1"],
        ],
      );
    });

    it("refuses to delete another application's subscription", async () => {
      server.wso2.respond = () => ({
        status: 200,
        data: { ...WSO2_SUBSCRIPTION, applicationId: "someone-elses-app" },
      });

      const res = await unsubscribe("sub-1");

      assert.equal(res.status, 404);
      assert.deepEqual(server.wso2.calls.map((c) => c.method), ["GET"]);
    });

    it("returns 404 for another user's app without calling WSO2", async () => {
      const res = await unsubscribe("sub-1", bob);
      assert.equal(res.status, 404);
      assert.equal(server.wso2.calls.length, 0);
    });
  });
});

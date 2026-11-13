import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";
import { startTestServer, type TestServer } from "./helpers";

const WSO2 = { "x-wso2-authorization": "Bearer wso2-token" };

const WSO2_KEY = {
  keyMappingId: "map-1",
  keyManager: "Resident Key Manager",
  consumerKey: "ck-123",
  consumerSecret: "cs-secret",
  supportedGrantTypes: ["client_credentials"],
  keyState: "COMPLETED",
  keyType: "PRODUCTION",
  token: { accessToken: "should-not-leak" },
};

describe("application keys", () => {
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

  describe("POST /applications/:id/keys", () => {
    const generate = (body: unknown, headers = alice) =>
      server.post(`/applications/${appId}/keys`, body, { ...headers, ...WSO2 });

    it("requires a WSO2 token", async () => {
      const res = await server.post(`/applications/${appId}/keys`, { keyType: "PRODUCTION" }, alice);
      assert.equal(res.status, 401);
      assert.equal(server.wso2.calls.length, 0);
    });

    it("rejects an unknown key type", async () => {
      const res = await generate({ keyType: "STAGING" });
      assert.equal(res.status, 400);
      assert.equal(server.wso2.calls.length, 0);
    });

    it("generates client-credentials keys and returns the secret once", async () => {
      server.wso2.respond = () => ({ status: 200, data: WSO2_KEY });

      const res = await generate({ keyType: "PRODUCTION" });

      assert.equal(res.status, 201);
      assert.deepEqual(res.body.key, {
        keyType: "PRODUCTION",
        keyMappingId: "map-1",
        consumerKey: "ck-123",
        consumerSecret: "cs-secret",
        keyManager: "Resident Key Manager",
        keyState: "COMPLETED",
        supportedGrantTypes: ["client_credentials"],
      });
      assert.deepEqual(server.wso2.calls, [
        {
          method: "POST",
          path: "/applications/wso2-app/generate-keys",
          authorization: "Bearer wso2-token",
          body: {
            keyType: "PRODUCTION",
            keyManager: "Resident Key Manager",
            grantTypesToBeSupported: ["client_credentials"],
            scopes: [],
            validityTime: 3600,
          },
        },
      ]);
    });

    it("returns 502 if WSO2's reply has no consumer key", async () => {
      server.wso2.respond = () => ({ status: 200, data: {} });
      const res = await generate({ keyType: "SANDBOX" });
      assert.equal(res.status, 502);
    });

    it("passes WSO2's conflict through when keys already exist", async () => {
      server.wso2.respond = () => {
        throw new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
          status: 409,
          statusText: "Conflict",
          data: { description: "Keys already generated" },
          headers: {},
          config: { headers: new AxiosHeaders() },
        });
      };
      const res = await generate({ keyType: "PRODUCTION" });
      assert.equal(res.status, 409);
      assert.equal(res.body.details.description, "Keys already generated");
    });

    it("returns 404 for another user's app without calling WSO2", async () => {
      const res = await generate({ keyType: "PRODUCTION" }, bob);
      assert.equal(res.status, 404);
      assert.equal(server.wso2.calls.length, 0);
    });
  });

  describe("GET /applications/:id/keys", () => {
    it("requires a WSO2 token", async () => {
      const res = await server.get(`/applications/${appId}/keys`, alice);
      assert.equal(res.status, 401);
    });

    it("lists keys without secrets or tokens", async () => {
      server.wso2.respond = () => ({
        status: 200,
        data: { count: 2, list: [WSO2_KEY, { ...WSO2_KEY, keyType: "SANDBOX", consumerKey: "ck-sb" }] },
      });

      const res = await server.get(`/applications/${appId}/keys`, { ...alice, ...WSO2 });

      assert.equal(res.status, 200);
      assert.equal(server.wso2.calls[0]?.path, "/applications/wso2-app/oauth-keys");
      assert.deepEqual(
        res.body.keys.map((k: { keyType: string; consumerKey: string }) => [k.keyType, k.consumerKey]),
        [["PRODUCTION", "ck-123"], ["SANDBOX", "ck-sb"]],
      );
      const raw = JSON.stringify(res.body);
      assert.ok(!raw.includes("cs-secret"));
      assert.ok(!raw.includes("should-not-leak"));
    });

    it("returns an empty list when WSO2 has none", async () => {
      server.wso2.respond = () => ({ status: 200, data: { count: 0, list: [] } });
      const res = await server.get(`/applications/${appId}/keys`, { ...alice, ...WSO2 });
      assert.deepEqual(res.body, { keys: [] });
    });

    it("returns 404 for another user's app", async () => {
      const res = await server.get(`/applications/${appId}/keys`, { ...bob, ...WSO2 });
      assert.equal(res.status, 404);
      assert.equal(server.wso2.calls.length, 0);
    });
  });
});

describe("POST /applications/:id/keys/:keyMappingId/regenerate-secret", () => {
  let server: TestServer;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let appId: string;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
    server.wso2.respond = () => ({ status: 201, data: { applicationId: "wso2-app" } });
    const { body } = await server.post("/applications", { name: "app" }, { ...alice, ...WSO2 });
    appId = body.application.id;
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
  });

  const regenerate = (headers: Record<string, string>, mapping = "map-1") =>
    server.post(`/applications/${appId}/keys/${mapping}/regenerate-secret`, {}, headers);

  it("requires a WSO2 token", async () => {
    const res = await regenerate(alice);
    assert.equal(res.status, 401);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("returns the new secret from WSO2", async () => {
    server.wso2.respond = () => ({
      status: 200,
      data: { consumerKey: "ck-123", consumerSecret: "new-secret" },
    });

    const res = await regenerate({ ...alice, ...WSO2 }, "map 1");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { key: { consumerKey: "ck-123", consumerSecret: "new-secret" } });
    assert.deepEqual(server.wso2.calls, [
      {
        method: "POST",
        path: "/applications/wso2-app/oauth-keys/map%201/regenerate-secret",
        body: {},
        authorization: "Bearer wso2-token",
      },
    ]);
  });

  it("returns 502 if WSO2's reply has no secret", async () => {
    server.wso2.respond = () => ({ status: 200, data: { consumerKey: "ck-123" } });
    const res = await regenerate({ ...alice, ...WSO2 });
    assert.equal(res.status, 502);
  });

  it("returns 404 for another user's app without calling WSO2", async () => {
    const res = await regenerate({ ...bob, ...WSO2 });
    assert.equal(res.status, 404);
    assert.equal(server.wso2.calls.length, 0);
  });
});

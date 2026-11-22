import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";
import { startTestServer, type TestServer } from "./helpers";

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
    const { body } = await server.post("/applications", { name: "app" }, alice);
    appId = body.application.id;
    server.wso2.calls.length = 0;
  });

  describe("POST /applications/:id/keys", () => {
    const generate = (body: unknown, headers = alice) =>
      server.post(`/applications/${appId}/keys`, body, headers);


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

    it("lists keys without secrets or tokens", async () => {
      server.wso2.respond = () => ({
        status: 200,
        data: { count: 2, list: [WSO2_KEY, { ...WSO2_KEY, keyType: "SANDBOX", consumerKey: "ck-sb" }] },
      });

      const res = await server.get(`/applications/${appId}/keys`, alice);

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
      const res = await server.get(`/applications/${appId}/keys`, alice);
      assert.deepEqual(res.body, { keys: [] });
    });

    it("returns 404 for another user's app", async () => {
      const res = await server.get(`/applications/${appId}/keys`, bob);
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
    const { body } = await server.post("/applications", { name: "app" }, alice);
    appId = body.application.id;
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
  });

  const regenerate = (headers: Record<string, string>, mapping = "map-1") =>
    server.post(`/applications/${appId}/keys/${mapping}/regenerate-secret`, {}, headers);

  it("returns the new secret from WSO2", async () => {
    server.wso2.respond = () => ({
      status: 200,
      data: { consumerKey: "ck-123", consumerSecret: "new-secret" },
    });

    const res = await regenerate(alice, "map 1");

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
    const res = await regenerate(alice);
    assert.equal(res.status, 502);
  });

  it("returns 404 for another user's app without calling WSO2", async () => {
    const res = await regenerate(bob);
    assert.equal(res.status, 404);
    assert.equal(server.wso2.calls.length, 0);
  });
});

describe("POST /applications/:id/keys/:keyMappingId/token", () => {
  let server: TestServer;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let appId: string;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
    server.wso2.respond = () => ({ status: 201, data: { applicationId: "wso2-app" } });
    const { body } = await server.post("/applications", { name: "app" }, alice);
    appId = body.application.id;
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
  });

  const getToken = (headers: Record<string, string>, body: unknown, mapping = "map-1") =>
    server.post(`/applications/${appId}/keys/${mapping}/token`, body, headers);

  it("gets a token from WSO2 with the caller's secret", async () => {
    server.wso2.respond = () => ({
      status: 200,
      data: { accessToken: "eyJ.token", validityTime: 3600, tokenScopes: ["default"] },
    });

    const res = await getToken(alice, { consumerSecret: " cs-secret " }, "map 1");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      token: { accessToken: "eyJ.token", tokenType: "Bearer", expiresIn: 3600, scopes: ["default"] },
    });
    assert.deepEqual(server.wso2.calls, [
      {
        method: "POST",
        path: "/applications/wso2-app/oauth-keys/map%201/generate-token",
        body: { consumerSecret: "cs-secret", validityPeriod: 3600, scopes: [] },
        authorization: "Bearer wso2-token",
      },
    ]);
  });

  it("marks the response as not cacheable", async () => {
    server.wso2.respond = () => ({ status: 200, data: { accessToken: "eyJ.token" } });
    const res = await fetch(`${server.url}/applications/${appId}/keys/map-1/token`, {
      method: "POST",
      headers: { "content-type": "application/json", ...alice },
      body: JSON.stringify({ consumerSecret: "cs-secret" }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("requires a consumer secret", async () => {
    for (const body of [{}, { consumerSecret: "  " }, { consumerSecret: 42 }]) {
      const res = await getToken(alice, body);
      assert.equal(res.status, 400);
    }
    assert.equal(server.wso2.calls.length, 0);
  });

  it("says so when WSO2 refuses the secret", async () => {
    server.wso2.respond = () => {
      throw new AxiosError("bad request", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        statusText: "Bad Request",
        data: { code: 900967 },
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
    };
    const res = await getToken(alice, { consumerSecret: "wrong" });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "WSO2 refused the consumer secret for these keys");
  });

  it("returns 502 if WSO2's reply has no token", async () => {
    server.wso2.respond = () => ({ status: 200, data: {} });
    const res = await getToken(alice, { consumerSecret: "cs-secret" });
    assert.equal(res.status, 502);
  });

  it("returns 404 for another user's app without calling WSO2", async () => {
    const res = await getToken(bob, { consumerSecret: "cs-secret" });
    assert.equal(res.status, 404);
    assert.equal(server.wso2.calls.length, 0);
  });
});

describe("DELETE /applications/:id/keys/:keyMappingId", () => {
  let server: TestServer;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let appId: string;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
    server.wso2.respond = () => ({ status: 201, data: { applicationId: "wso2-app" } });
    const { body } = await server.post("/applications", { name: "app" }, alice);
    appId = body.application.id;
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
    server.wso2.respond = (call) =>
      call.method === "GET"
        ? { status: 200, data: { list: [{ ...WSO2_KEY, keyMappingId: "map 1" }] } }
        : { status: 200, data: {} };
  });

  const deleteKeys = (headers: Record<string, string>, mapping = "map 1") =>
    server.delete(`/applications/${appId}/keys/${encodeURIComponent(mapping)}`, headers);

  it("deletes the keys in WSO2", async () => {
    const res = await deleteKeys(alice);
    assert.equal(res.status, 204);
    assert.deepEqual(
      server.wso2.calls.map((c) => `${c.method} ${c.path} ${c.authorization}`),
      [
        "GET /applications/wso2-app/oauth-keys Bearer wso2-token",
        "DELETE /applications/wso2-app/oauth-keys/map%201 Bearer wso2-token",
      ],
    );
  });

  it("returns 404 without deleting when the app has no such keys", async () => {
    const res = await deleteKeys(alice, "other-mapping");
    assert.equal(res.status, 404);
    assert.ok(!server.wso2.calls.some((c) => c.method === "DELETE"));
  });

  it("returns 404 for another user's app without calling WSO2", async () => {
    const res = await deleteKeys(bob);
    assert.equal(res.status, 404);
    assert.equal(server.wso2.calls.length, 0);
  });
});

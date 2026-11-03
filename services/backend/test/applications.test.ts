import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";
import { startTestServer, type TestServer } from "./helpers";

const WSO2 = { "x-wso2-authorization": "Bearer wso2-token" };

describe("applications", () => {
  let server: TestServer;
  let alice: Record<string, string>;
  let bob: Record<string, string>;
  let wso2Ids: number;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
    server.applications.records.length = 0;
    wso2Ids = 0;
    server.wso2.respond = (call) =>
      call.method === "POST"
        ? { status: 201, data: { applicationId: `wso2-${++wso2Ids}` } }
        : { status: 200, data: {} };
  });

  const create = (
    headers: Record<string, string>,
    body: unknown = { name: "my-app" },
  ) => server.post("/applications", body, { ...headers, ...WSO2 });

  describe("POST /applications", () => {
    it("requires an OpenGate token", async () => {
      const res = await server.post("/applications", { name: "x" }, WSO2);
      assert.equal(res.status, 401);
      assert.equal(server.wso2.calls.length, 0);
    });

    it("requires a WSO2 token", async () => {
      const res = await server.post("/applications", { name: "x" }, alice);
      assert.equal(res.status, 401);
      assert.equal(server.wso2.calls.length, 0);
    });

    it("requires a name", async () => {
      const res = await create(alice, { name: "  " });
      assert.equal(res.status, 400);
      assert.equal(server.wso2.calls.length, 0);
    });

    it("creates the app in WSO2 and records the caller as owner", async () => {
      const res = await create(alice, { name: " my-app ", description: " demo " });

      assert.equal(res.status, 201);
      assert.equal(res.body.application.wso2ApplicationId, "wso2-1");
      assert.equal(res.body.application.name, "my-app");
      assert.equal(res.body.application.description, "demo");
      assert.deepEqual(server.wso2.calls, [
        {
          method: "POST",
          path: "/applications",
          authorization: "Bearer wso2-token",
          body: {
            name: "my-app",
            description: "demo",
            throttlingPolicy: "Unlimited",
            tokenType: "JWT",
          },
        },
      ]);
      const me = await server.get("/auth/me", alice);
      assert.equal(server.applications.records[0]?.ownerId, me.body.user.id);
    });

    it("passes WSO2 error statuses through and records nothing", async () => {
      server.wso2.respond = () => {
        throw new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
          status: 409,
          statusText: "Conflict",
          data: { description: "Application already exists" },
          headers: {},
          config: { headers: new AxiosHeaders() },
        });
      };
      const res = await create(alice);
      assert.equal(res.status, 409);
      assert.equal(res.body.details.description, "Application already exists");
      assert.equal(server.applications.records.length, 0);
    });

    it("returns 502 when WSO2 is unreachable", async () => {
      server.wso2.respond = () => {
        throw new AxiosError("connect ECONNREFUSED", "ECONNREFUSED");
      };
      assert.equal((await create(alice)).status, 502);
    });

    it("returns 502 when WSO2 omits the application id", async () => {
      server.wso2.respond = () => ({ status: 201, data: {} });
      const res = await create(alice);
      assert.equal(res.status, 502);
      assert.equal(server.applications.records.length, 0);
    });

    it("deletes the WSO2 app if saving the record fails", async () => {
      server.applications.failNextCreate = new Error("mongo down");
      const res = await create(alice);

      assert.equal(res.status, 500);
      assert.deepEqual(
        server.wso2.calls.map((c) => `${c.method} ${c.path} ${c.authorization}`),
        [
          "POST /applications Bearer wso2-token",
          "DELETE /applications/wso2-1 Bearer wso2-token",
        ],
      );
    });

    it("still returns the original error if the rollback also fails", async () => {
      server.applications.failNextCreate = new Error("mongo down");
      server.wso2.respond = (call) => {
        if (call.method === "DELETE") throw new Error("wso2 down too");
        return { status: 201, data: { applicationId: "wso2-x" } };
      };
      assert.equal((await create(alice)).status, 500);
    });
  });

  describe("GET /applications", () => {
    it("requires an OpenGate token", async () => {
      assert.equal((await server.get("/applications")).status, 401);
    });

    it("lists only the caller's applications, newest first", async () => {
      await create(alice, { name: "a1" });
      await create(bob, { name: "b1" });
      await create(alice, { name: "a2" });

      const res = await server.get("/applications", alice);
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.applications.map((a: { name: string }) => a.name),
        ["a2", "a1"],
      );
    });

    it("does not need a WSO2 token", async () => {
      const res = await server.get("/applications", alice);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.applications, []);
    });
  });

  describe("GET /applications/:id", () => {
    it("returns the caller's application", async () => {
      const { body } = await create(alice);
      const res = await server.get(`/applications/${body.application.id}`, alice);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.application, body.application);
    });

    it("returns 404 for someone else's application", async () => {
      const { body } = await create(alice);
      const res = await server.get(`/applications/${body.application.id}`, bob);
      assert.equal(res.status, 404);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await server.get("/applications/does-not-exist", alice);
      assert.equal(res.status, 404);
    });
  });

  describe("DELETE /applications/:id", () => {
    const notFoundInWso2 = () => {
      throw new AxiosError("not found", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 404,
        statusText: "Not Found",
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
    };

    it("deletes the app in WSO2 and removes the record", async () => {
      const { body } = await create(alice);
      server.wso2.calls.length = 0;

      const res = await server.delete(`/applications/${body.application.id}`, {
        ...alice,
        ...WSO2,
      });
      assert.equal(res.status, 204);
      assert.deepEqual(
        server.wso2.calls.map((c) => `${c.method} ${c.path} ${c.authorization}`),
        ["DELETE /applications/wso2-1 Bearer wso2-token"],
      );
      const after = await server.get(`/applications/${body.application.id}`, alice);
      assert.equal(after.status, 404);
    });

    it("requires a WSO2 token", async () => {
      const { body } = await create(alice);
      server.wso2.calls.length = 0;
      const res = await server.delete(`/applications/${body.application.id}`, alice);
      assert.equal(res.status, 401);
      assert.equal(server.wso2.calls.length, 0);
      assert.equal(server.applications.records.length, 1);
    });

    it("returns 404 for someone else's app without touching WSO2", async () => {
      const { body } = await create(alice);
      server.wso2.calls.length = 0;
      const res = await server.delete(`/applications/${body.application.id}`, {
        ...bob,
        ...WSO2,
      });
      assert.equal(res.status, 404);
      assert.equal(server.wso2.calls.length, 0);
      assert.equal(server.applications.records.length, 1);
    });

    it("still removes the record if WSO2 already deleted the app", async () => {
      const { body } = await create(alice);
      server.wso2.respond = notFoundInWso2;
      const res = await server.delete(`/applications/${body.application.id}`, {
        ...alice,
        ...WSO2,
      });
      assert.equal(res.status, 204);
      assert.equal(server.applications.records.length, 0);
    });

    it("keeps the record if WSO2 refuses the delete", async () => {
      const { body } = await create(alice);
      server.wso2.respond = () => {
        throw new AxiosError("forbidden", "ERR_BAD_REQUEST", undefined, undefined, {
          status: 403,
          statusText: "Forbidden",
          data: {},
          headers: {},
          config: { headers: new AxiosHeaders() },
        });
      };
      const res = await server.delete(`/applications/${body.application.id}`, {
        ...alice,
        ...WSO2,
      });
      assert.equal(res.status, 403);
      assert.equal(server.applications.records.length, 1);
    });
  });
});

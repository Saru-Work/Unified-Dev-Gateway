import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";
import { startTestServer, type TestServer } from "./helpers";

const WSO2 = { "x-wso2-authorization": "Bearer wso2-token" };

describe("POST /applications", () => {
  let server: TestServer;
  let auth: Record<string, string>;

  before(async () => {
    server = await startTestServer();
    auth = await server.login();
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
    server.wso2.respond = () => ({
      status: 201,
      data: { applicationId: "wso2-app-1", name: "my-app" },
    });
  });

  it("requires an OpenGate token", async () => {
    const res = await server.post("/applications", { name: "x" }, WSO2);
    assert.equal(res.status, 401);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("requires a WSO2 token", async () => {
    const res = await server.post("/applications", { name: "x" }, auth);
    assert.equal(res.status, 401);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("requires a name", async () => {
    const res = await server.post(
      "/applications",
      { name: "  " },
      { ...auth, ...WSO2 },
    );
    assert.equal(res.status, 400);
    assert.equal(server.wso2.calls.length, 0);
  });

  it("creates the application in WSO2 with the caller's WSO2 token", async () => {
    const res = await server.post(
      "/applications",
      { name: " my-app ", description: "demo" },
      { ...auth, ...WSO2 },
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.applicationId, "wso2-app-1");
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
  });

  it("passes WSO2 error statuses through", async () => {
    server.wso2.respond = () => {
      throw new AxiosError("conflict", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        statusText: "Conflict",
        data: { description: "Application already exists" },
        headers: {},
        config: { headers: new AxiosHeaders() },
      });
    };
    const res = await server.post(
      "/applications",
      { name: "dup" },
      { ...auth, ...WSO2 },
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.details.description, "Application already exists");
  });

  it("returns 502 when WSO2 is unreachable", async () => {
    server.wso2.respond = () => {
      throw new AxiosError("connect ECONNREFUSED", "ECONNREFUSED");
    };
    const res = await server.post(
      "/applications",
      { name: "x" },
      { ...auth, ...WSO2 },
    );
    assert.equal(res.status, 502);
  });
});

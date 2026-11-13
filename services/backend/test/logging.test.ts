import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { startTestServer, type TestServer } from "./helpers";

describe("request ids and logging", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());
  beforeEach(() => {
    server.logs.length = 0;
  });

  /** The "finish" log can land just after the client has the response. */
  async function requestLog(requestId: string) {
    for (let i = 0; i < 50; i++) {
      const entry = server.logs.find((e) => e.msg === "request" && e.requestId === requestId);
      if (entry) return entry;
      await tick();
    }
    assert.fail(`no request log for ${requestId}`);
  }

  it("generates a request id and logs the request without its query", async () => {
    const res = await fetch(`${server.url}/health?secret=1`);
    const requestId = res.headers.get("x-request-id");

    assert.match(requestId ?? "", /^[0-9a-f-]{36}$/);
    const entry = await requestLog(requestId!);
    assert.equal(entry.level, "info");
    assert.equal(entry.method, "GET");
    assert.equal(entry.path, "/health");
    assert.equal(entry.status, 200);
    assert.equal(typeof entry.durationMs, "number");
  });

  it("reuses a safe incoming X-Request-Id and replaces an unsafe one", async () => {
    const reused = await fetch(`${server.url}/health`, {
      headers: { "x-request-id": "trace-abc.123" },
    });
    assert.equal(reused.headers.get("x-request-id"), "trace-abc.123");

    const replaced = await fetch(`${server.url}/health`, {
      headers: { "x-request-id": "bad id\twith spaces" },
    });
    assert.notEqual(replaced.headers.get("x-request-id"), "bad id\twith spaces");
  });

  it("logs client errors as warnings", async () => {
    const res = await fetch(`${server.url}/auth/me`);
    assert.equal(res.status, 401);
    const entry = await requestLog(res.headers.get("x-request-id")!);
    assert.equal(entry.level, "warn");
  });

  it("returns the request id with a 500 and logs the error under it", async () => {
    server.wso2.respond = () => {
      throw new Error("boom");
    };

    const res = await fetch(`${server.url}/apis`);
    const body = await res.json();
    const requestId = res.headers.get("x-request-id");

    assert.equal(res.status, 500);
    assert.deepEqual(body, { message: "Internal server error", requestId });
    const error = server.logs.find((e) => e.msg === "Unhandled error");
    assert.equal(error?.requestId, requestId);
    assert.match(String(error?.error), /boom/);
    assert.equal((await requestLog(requestId!)).level, "error");
  });
});

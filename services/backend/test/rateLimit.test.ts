import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers";

describe("rate limiting", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  it("answers 429 with the usual JSON error and rate-limit headers", async () => {
    const attempt = () =>
      fetch(`${server.url}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.com", password: "wrong-password" }),
      });
    for (let i = 0; i < 20; i++) assert.equal((await attempt()).status, 401);

    const res = await attempt();
    assert.equal(res.status, 429);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.ok(res.headers.get("retry-after"));
    assert.deepEqual(await res.json(), { message: "Too many requests. Try again later." });
  });
});

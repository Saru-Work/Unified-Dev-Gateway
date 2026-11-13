import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers";

describe("POST /auth/password", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  const change = (body: unknown, headers: Record<string, string>) =>
    server.post("/auth/password", body, headers);
  const canLogin = async (email: string, password: string) =>
    (await server.post("/auth/login", { email, password })).status === 200;

  it("requires an OpenGate token", async () => {
    const res = await change({ currentPassword: "password123", newPassword: "newpass456" }, {});
    assert.equal(res.status, 401);
  });

  it("changes the password", async () => {
    const auth = await server.login("change@example.com");

    const res = await change(
      { currentPassword: "password123", newPassword: "newpass456" },
      auth,
    );

    assert.equal(res.status, 204);
    assert.equal(await canLogin("change@example.com", "password123"), false);
    assert.equal(await canLogin("change@example.com", "newpass456"), true);
  });

  it("rejects a wrong current password with 403", async () => {
    const auth = await server.login("wrong@example.com");
    const res = await change({ currentPassword: "nope-nope", newPassword: "newpass456" }, auth);
    assert.equal(res.status, 403);
    assert.equal(await canLogin("wrong@example.com", "password123"), true);
  });

  it("validates the new password", async () => {
    const auth = await server.login("validate@example.com");
    const cases: [unknown, number][] = [
      [{}, 400],
      [{ currentPassword: "password123", newPassword: 12345678 }, 400],
      [{ currentPassword: "password123", newPassword: "short" }, 400],
      [{ currentPassword: "password123", newPassword: "password123" }, 400],
    ];
    for (const [body, status] of cases) {
      const res = await change(body, auth);
      assert.equal(res.status, status, JSON.stringify(body));
    }
    assert.equal(await canLogin("validate@example.com", "password123"), true);
  });
});

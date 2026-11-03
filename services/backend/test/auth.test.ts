import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserTokenService } from "../src/security/UserTokenService";
import { startTestServer, type TestServer } from "./helpers";

describe("auth", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  it("registers a user and normalises the email", async () => {
    const res = await server.post("/auth/register", {
      email: "  Alice@Example.COM ",
      password: "password123",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, "alice@example.com");
    assert.ok(res.body.user.id);
    assert.equal(res.body.user.passwordHash, undefined);
  });

  it("rejects a duplicate email with 409", async () => {
    const body = { email: "dup@example.com", password: "password123" };
    await server.post("/auth/register", body);
    const res = await server.post("/auth/register", body);
    assert.equal(res.status, 409);
  });

  it("rejects missing credentials with 400", async () => {
    for (const body of [{}, { email: "a@b.c" }, { password: "password123" }]) {
      const res = await server.post("/auth/register", body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it("rejects non-string credentials with 400", async () => {
    const res = await server.post("/auth/register", {
      email: { $gt: "" },
      password: "password123",
    });
    assert.equal(res.status, 400);
  });

  it("rejects short passwords with 400", async () => {
    const res = await server.post("/auth/register", {
      email: "short@example.com",
      password: "short",
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await server.post("/auth/register", "{bad");
    assert.equal(res.status, 400);
  });

  it("logs in and returns a usable bearer token", async () => {
    await server.post("/auth/register", {
      email: "bob@example.com",
      password: "password123",
    });
    const login = await server.post("/auth/login", {
      email: "BOB@example.com",
      password: "password123",
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.tokenType, "Bearer");
    assert.equal(login.body.expiresIn, 900);

    const me = await server.get("/auth/me", {
      authorization: `Bearer ${login.body.accessToken}`,
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, "bob@example.com");
  });

  it("gives the same 401 for wrong password and unknown user", async () => {
    await server.post("/auth/register", {
      email: "carol@example.com",
      password: "password123",
    });
    const wrong = await server.post("/auth/login", {
      email: "carol@example.com",
      password: "nope-nope",
    });
    const unknown = await server.post("/auth/login", {
      email: "nobody@example.com",
      password: "password123",
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
  });

  it("rejects /auth/me without a valid token", async () => {
    assert.equal((await server.get("/auth/me")).status, 401);
    const bad = await server.get("/auth/me", { authorization: "Bearer junk" });
    assert.equal(bad.status, 401);
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await new UserTokenService(
      "another-secret-that-is-also-32-bytes-long",
    ).issue("1");
    const res = await server.get("/auth/me", {
      authorization: `Bearer ${forged}`,
    });
    assert.equal(res.status, 401);
  });
});

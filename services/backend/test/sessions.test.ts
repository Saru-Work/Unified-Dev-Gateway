import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers";

describe("sessions (refresh tokens)", () => {
  let server: TestServer;
  let n = 0;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  /** Registers a fresh user and signs in, returning the login body. */
  async function signIn(email = `s${n++}@example.com`, password = "password123") {
    await server.post("/auth/register", { email, password });
    const res = await server.post("/auth/login", { email, password });
    assert.equal(res.status, 200);
    return { ...res.body, email, password };
  }

  const refresh = (refreshToken: unknown) => server.post("/auth/refresh", { refreshToken });

  it("returns a refresh token with the access token on login", async () => {
    const login = await signIn();
    assert.equal(typeof login.refreshToken, "string");
    assert.ok(login.refreshToken.length >= 40);
    assert.equal(login.refreshExpiresIn, 30 * 24 * 60 * 60);
  });

  it("stores only a hash of the refresh token", async () => {
    const login = await signIn();
    assert.ok(server.refreshTokens.records.every((r) => r.tokenHash !== login.refreshToken));
  });

  it("swaps a refresh token for a working access token and a new refresh token", async () => {
    const login = await signIn();
    const res = await refresh(login.refreshToken);
    assert.equal(res.status, 200);
    assert.notEqual(res.body.refreshToken, login.refreshToken);
    assert.equal(res.body.user.email, login.email);

    const me = await server.get("/auth/me", { authorization: `Bearer ${res.body.accessToken}` });
    assert.equal(me.status, 200);

    // The new one works in turn.
    assert.equal((await refresh(res.body.refreshToken)).status, 200);
  });

  it("allows a used token again within the grace period (parallel requests)", async () => {
    const login = await signIn();
    const [a, b] = await Promise.all([refresh(login.refreshToken), refresh(login.refreshToken)]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    server.clock.advance(5);
    assert.equal((await refresh(login.refreshToken)).status, 200);
    // Both branches keep working.
    assert.equal((await refresh(a.body.refreshToken)).status, 200);
    assert.equal((await refresh(b.body.refreshToken)).status, 200);
  });

  it("revokes the whole session when a used token is replayed later", async () => {
    const login = await signIn();
    const next = await refresh(login.refreshToken);
    server.clock.advance(60);

    const replay = await refresh(login.refreshToken);
    assert.equal(replay.status, 401);
    // The legitimate holder of the newer token is signed out too.
    assert.equal((await refresh(next.body.refreshToken)).status, 401);
  });

  it("rejects an expired refresh token", async () => {
    const login = await signIn();
    server.clock.advance(30 * 24 * 60 * 60 + 1);
    assert.equal((await refresh(login.refreshToken)).status, 401);
  });

  it("rejects unknown and missing refresh tokens", async () => {
    assert.equal((await refresh("not-a-real-token")).status, 401);
    assert.equal((await refresh(undefined)).status, 400);
    assert.equal((await refresh(42)).status, 400);
    assert.equal((await refresh("")).status, 400);
  });

  it("signs out with POST /auth/logout", async () => {
    const login = await signIn();
    const next = await refresh(login.refreshToken);
    const res = await server.post("/auth/logout", { refreshToken: next.body.refreshToken });
    assert.equal(res.status, 204);
    assert.equal((await refresh(next.body.refreshToken)).status, 401);
    // Logging out an unknown token is harmless.
    assert.equal((await server.post("/auth/logout", { refreshToken: "nope" })).status, 204);
  });

  it("keeps other sessions when one signs out", async () => {
    const first = await signIn();
    const second = await server.post("/auth/login", { email: first.email, password: first.password });
    await server.post("/auth/logout", { refreshToken: first.refreshToken });
    assert.equal((await refresh(second.body.refreshToken)).status, 200);
  });

  it("rejects a non-string refreshToken on password change", async () => {
    const login = await signIn();
    const res = await server.post(
      "/auth/password",
      { currentPassword: login.password, newPassword: "new-password-1", refreshToken: 7 },
      { authorization: `Bearer ${login.accessToken}` },
    );
    assert.equal(res.status, 400);
  });
});

// A fresh server: the sign-in rate limit (20 per 15 minutes) is per app.
describe("sessions after a password change", () => {
  let server: TestServer;
  let n = 0;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  async function signIn(email = `p${n++}@example.com`, password = "password123") {
    await server.post("/auth/register", { email, password });
    const res = await server.post("/auth/login", { email, password });
    assert.equal(res.status, 200);
    return { ...res.body, email, password };
  }

  const refresh = (refreshToken: unknown) => server.post("/auth/refresh", { refreshToken });

  it("signs out other sessions on password change, keeping the current one", async () => {
    const current = await signIn();
    const other = await server.post("/auth/login", { email: current.email, password: current.password });

    const res = await server.post(
      "/auth/password",
      { currentPassword: current.password, newPassword: "new-password-1", refreshToken: current.refreshToken },
      { authorization: `Bearer ${current.accessToken}` },
    );
    assert.equal(res.status, 204);
    assert.equal((await refresh(other.body.refreshToken)).status, 401);
    assert.equal((await refresh(current.refreshToken)).status, 200);
  });

  it("signs out every session on password change without a refresh token", async () => {
    const login = await signIn();
    await server.post(
      "/auth/password",
      { currentPassword: login.password, newPassword: "new-password-1" },
      { authorization: `Bearer ${login.accessToken}` },
    );
    assert.equal((await refresh(login.refreshToken)).status, 401);
  });

  it("can't keep another user's session alive through a password change", async () => {
    const victim = await signIn();
    const attacker = await signIn();
    await server.post(
      "/auth/password",
      { currentPassword: attacker.password, newPassword: "new-password-1", refreshToken: victim.refreshToken },
      { authorization: `Bearer ${attacker.accessToken}` },
    );
    // Attacker's own sessions are all revoked; the victim's is untouched.
    assert.equal((await refresh(attacker.refreshToken)).status, 401);
    assert.equal((await refresh(victim.refreshToken)).status, 200);
  });
});

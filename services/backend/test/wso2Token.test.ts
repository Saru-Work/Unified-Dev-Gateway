import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { AxiosError, AxiosHeaders } from "axios";
import { AppError } from "../src/errors/AppError";
import {
  WSO2_SCOPES,
  Wso2TokenProvider,
  type Wso2TokenProviderOptions,
} from "../src/integrations/wso2/Wso2TokenProvider";
import { startTestServer, type TestServer } from "./helpers";

interface SeenRequest {
  path: string;
  authorization: string | undefined;
  body: string;
}

/** A stand-in for WSO2's client-registration and token endpoints. */
async function startFakeWso2Auth() {
  const seen: SeenRequest[] = [];
  const state = {
    tokenStatus: 200,
    expiresIn: 3600,
    issued: 0,
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", authorization: req.headers.authorization, body });
      res.setHeader("content-type", "application/json");
      if (req.url === "/client-registration/v0.17/register") {
        res.end(JSON.stringify({ clientId: "dcr-id", clientSecret: "dcr-secret" }));
      } else if (req.url === "/oauth2/token") {
        res.statusCode = state.tokenStatus;
        if (state.tokenStatus !== 200) {
          res.end(JSON.stringify({ error: "invalid_client" }));
          return;
        }
        state.issued++;
        res.end(
          JSON.stringify({ access_token: `tok-${state.issued}`, expires_in: state.expiresIn }),
        );
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    seen,
    state,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

describe("Wso2TokenProvider", () => {
  let wso2: Awaited<ReturnType<typeof startFakeWso2Auth>>;
  let now: number;
  const logged: unknown[] = [];

  const provider = (options: Partial<Wso2TokenProviderOptions> = {}) =>
    new Wso2TokenProvider(
      {
        origin: wso2.origin,
        username: "svc",
        password: "svc-pass",
        log: (_msg, err) => logged.push(err),
        ...options,
      },
      () => now,
    );

  beforeEach(async () => {
    wso2 = await startFakeWso2Auth();
    now = 1_000_000;
    logged.length = 0;
  });
  afterEach(() => wso2.close());

  it("registers a client, then gets a password-grant token with OpenGate's scopes", async () => {
    const auth = await provider().getAuthorization();
    assert.equal(auth, "Bearer tok-1");

    const [register, token] = wso2.seen;
    assert.equal(register.path, "/client-registration/v0.17/register");
    assert.equal(register.authorization, basic("svc", "svc-pass"));
    assert.equal(JSON.parse(register.body).owner, "svc");

    assert.equal(token.path, "/oauth2/token");
    assert.equal(token.authorization, basic("dcr-id", "dcr-secret"));
    const form = new URLSearchParams(token.body);
    assert.equal(form.get("grant_type"), "password");
    assert.equal(form.get("username"), "svc");
    assert.equal(form.get("password"), "svc-pass");
    assert.equal(form.get("scope"), WSO2_SCOPES);
  });

  it("uses a configured client instead of registering one", async () => {
    await provider({ clientId: "cfg-id", clientSecret: "cfg-secret" }).getAuthorization();
    assert.deepEqual(wso2.seen.map((r) => r.path), ["/oauth2/token"]);
    assert.equal(wso2.seen[0].authorization, basic("cfg-id", "cfg-secret"));
  });

  it("caches the token and shares one request between concurrent callers", async () => {
    const p = provider();
    const tokens = await Promise.all([p.getAuthorization(), p.getAuthorization()]);
    assert.deepEqual(tokens, ["Bearer tok-1", "Bearer tok-1"]);
    assert.equal(await p.getAuthorization(), "Bearer tok-1");
    assert.equal(wso2.seen.filter((r) => r.path === "/oauth2/token").length, 1);
    assert.equal(wso2.seen.filter((r) => r.path.startsWith("/client-registration")).length, 1);
  });

  it("refreshes a minute before the token expires, without registering again", async () => {
    const p = provider();
    await p.getAuthorization();
    now += 3600_000 - 61_000;
    assert.equal(await p.getAuthorization(), "Bearer tok-1");
    now += 2_000;
    assert.equal(await p.getAuthorization(), "Bearer tok-2");
    assert.equal(wso2.seen.filter((r) => r.path.startsWith("/client-registration")).length, 1);
  });

  it("gets a new token after invalidate, but ignores stale invalidations", async () => {
    const p = provider();
    const first = await p.getAuthorization();
    p.invalidate("Bearer something-else");
    assert.equal(await p.getAuthorization(), first);
    p.invalidate(first);
    assert.equal(await p.getAuthorization(), "Bearer tok-2");
  });

  it("fails with a 502 AppError, logs why, and recovers on the next call", async () => {
    const p = provider();
    wso2.state.tokenStatus = 401;
    await assert.rejects(p.getAuthorization(), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 502);
      return true;
    });
    assert.equal(logged.length, 1);
    assert.doesNotMatch(JSON.stringify(logged), /svc-pass|dcr-secret/);

    wso2.state.tokenStatus = 200;
    assert.equal(await p.getAuthorization(), "Bearer tok-1");
    // A rejected client is registered again.
    assert.equal(wso2.seen.filter((r) => r.path.startsWith("/client-registration")).length, 2);
  });
});

describe("WSO2 calls use OpenGate's own token", () => {
  let server: TestServer;
  let alice: Record<string, string>;

  beforeEach(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
  });
  afterEach(() => server.close());

  const unauthorized = () =>
    new AxiosError("unauthorized", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 401,
      statusText: "Unauthorized",
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    });

  it("ignores a WSO2 token sent by the client", async () => {
    server.wso2.respond = () => ({ status: 200, data: { list: [] } });
    const res = await server.get("/throttling-policies/application", {
      ...alice,
      "x-wso2-authorization": "Bearer users-own-token",
    });
    assert.equal(res.status, 200);
    assert.equal(server.wso2.calls[0].authorization, "Bearer wso2-token");
  });

  it("retries once with a fresh token when WSO2 rejects the cached one", async () => {
    server.wso2Token.tokens = ["stale", "fresh"];
    server.wso2.respond = (call) => {
      if (call.authorization === "Bearer stale") throw unauthorized();
      return { status: 200, data: { list: [] } };
    };
    const res = await server.get("/throttling-policies/application", alice);
    assert.equal(res.status, 200);
    assert.deepEqual(server.wso2Token.invalidated, ["Bearer stale"]);
    assert.deepEqual(
      server.wso2.calls.map((c) => c.authorization),
      ["Bearer stale", "Bearer fresh"],
    );
  });

  it("passes WSO2's 401 through if the fresh token is rejected too", async () => {
    server.wso2.respond = () => {
      throw unauthorized();
    };
    const res = await server.get("/throttling-policies/application", alice);
    assert.equal(res.status, 401);
    assert.equal(server.wso2.calls.length, 2);
  });

  it("returns 502 without calling WSO2 when no token can be had", async () => {
    server.wso2Token.failWith = new AppError(502, "OpenGate couldn't authenticate with WSO2");
    const res = await server.post("/applications", { name: "app" }, alice);
    assert.equal(res.status, 502);
    assert.equal(res.body.message, "OpenGate couldn't authenticate with WSO2");
    assert.equal(server.wso2.calls.length, 0);
    assert.equal(server.applications.records.length, 0);
  });
});

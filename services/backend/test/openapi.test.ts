import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app";
import { openApiDocument } from "../src/openapi";
import { UserTokenService } from "../src/security/UserTokenService";
import {
  FakeWso2,
  InMemoryApplicationRepository,
  InMemoryUserRepository,
  TEST_SECRET,
  fakeHasher,
  startTestServer,
  type TestServer,
} from "./helpers";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Every documented [METHOD, /path] pair. */
function documentedOperations(): [string, string][] {
  return Object.entries(openApiDocument.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => m in item).map((m): [string, string] => [m.toUpperCase(), path]),
  );
}

interface Layer {
  route?: { methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Counts route/method pairs registered in Express, including mounted routers. */
function countRegisteredOperations(stack: Layer[]): number {
  return stack.reduce((n, layer) => {
    if (layer.route) {
      return n + Object.keys(layer.route.methods).filter((m) => m !== "_all").length;
    }
    return layer.handle?.stack ? n + countRegisteredOperations(layer.handle.stack) : n;
  }, 0);
}

describe("GET /openapi.json", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  it("serves the OpenAPI document", async () => {
    const res = await server.get("/openapi.json");
    assert.equal(res.status, 200);
    assert.equal(res.body.openapi, "3.1.0");
    assert.ok(res.body.paths["/applications/{id}/keys"]);
  });

  it("documents exactly as many operations as the app registers", () => {
    const app = createApp({
      users: new InMemoryUserRepository(),
      applications: new InMemoryApplicationRepository(),
      passwords: fakeHasher,
      tokens: new UserTokenService(TEST_SECRET),
      wso2: new FakeWso2(),
      log: () => {},
    });
    const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack;
    assert.equal(documentedOperations().length, countRegisteredOperations(stack));
  });

  it("only documents operations that reach a handler", async () => {
    for (const [method, path] of documentedOperations()) {
      const url = server.url + path.replace(/\{[^}]+\}/g, "x");
      const res = await fetch(url, { method });
      // Express's own fallback for unmatched routes is an HTML "Cannot GET".
      const text = await res.text();
      assert.ok(!text.includes(`Cannot ${method}`), `${method} ${path} is not routed`);
    }
  });
});

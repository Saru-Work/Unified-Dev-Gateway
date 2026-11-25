import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/errors/AppError";
import { startTestServer, type TestServer } from "./helpers";

describe("saved APIs", () => {
  let server: TestServer;
  let alice: Record<string, string>;
  let bob: Record<string, string>;

  before(async () => {
    server = await startTestServer();
    alice = await server.login("alice@example.com");
    bob = await server.login("bob@example.com");
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.respond = () => ({ status: 200, data: {} });
  });

  const ids = async (who: Record<string, string>) =>
    (await server.get("/saved-apis", who)).body.apis.map((a: { apiId: string }) => a.apiId);

  it("needs a signed-in user", async () => {
    assert.equal((await server.get("/saved-apis")).status, 401);
    assert.equal((await server.put("/saved-apis/a")).status, 401);
    assert.equal((await server.delete("/saved-apis/a")).status, 401);
  });

  it("saves, lists newest first, and removes, per user", async () => {
    assert.equal((await server.put("/saved-apis/a", alice)).status, 204);
    assert.equal((await server.put("/saved-apis/b", alice)).status, 204);
    assert.equal((await server.put("/saved-apis/a", alice)).status, 204);
    assert.deepEqual(await ids(alice), ["b", "a"]);
    assert.deepEqual(await ids(bob), []);

    assert.equal((await server.delete("/saved-apis/b", bob)).status, 204);
    assert.deepEqual(await ids(alice), ["b", "a"]);
    assert.equal((await server.delete("/saved-apis/b", alice)).status, 204);
    assert.equal((await server.delete("/saved-apis/b", alice)).status, 204);
    assert.deepEqual(await ids(alice), ["a"]);
  });

  it("won't save an API that isn't in the catalog", async () => {
    server.wso2.respond = () => {
      throw new AppError(404, "Not found");
    };
    assert.equal((await server.put("/saved-apis/missing", bob)).status, 404);
    assert.deepEqual(await ids(bob), []);
  });

  it("encodes the id so it can't change the WSO2 path", async () => {
    await server.put("/saved-apis/a%2F..%2Fapplications", bob);
    assert.equal(server.wso2.calls.at(-1)?.path, "/apis/a%2F..%2Fapplications");
  });
});

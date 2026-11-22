import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosHeaders } from "axios";
import { startTestServer, type TestServer } from "./helpers";

function wso2Error(status: number, data: unknown) {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });
}

describe("apis", () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());
  beforeEach(() => {
    server.wso2.calls.length = 0;
  });

  it("GET /apis relays WSO2's list without credentials", async () => {
    const list = { count: 1, list: [{ id: "api-1", name: "Pets" }] };
    server.wso2.respond = () => ({ status: 200, data: list });

    const res = await server.get("/apis");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, list);
    assert.deepEqual(server.wso2.calls, [
      { method: "GET", path: "/apis", authorization: undefined },
    ]);
  });

  it("GET /apis/:id relays one API", async () => {
    const api = { id: "api-1", name: "Pets", tiers: [{ tierName: "Unlimited" }] };
    server.wso2.respond = () => ({ status: 200, data: api });

    const res = await server.get("/apis/api-1");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, api);
    assert.equal(server.wso2.calls[0]?.path, "/apis/api-1");
  });

  it("GET /apis/:id encodes the id so it can't change the WSO2 path", async () => {
    server.wso2.respond = () => ({ status: 200, data: {} });

    await server.get("/apis/a%2F..%2Fapplications");

    assert.equal(server.wso2.calls[0]?.path, "/apis/a%2F..%2Fapplications");
  });

  it("GET /apis/:id passes WSO2's 404 through", async () => {
    server.wso2.respond = () => {
      throw wso2Error(404, { code: 404, message: "Not Found" });
    };

    const res = await server.get("/apis/missing");

    assert.equal(res.status, 404);
    assert.equal(res.body.message, "WSO2 request failed");
  });
});

describe("GET /apis paging", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  it("passes limit and offset to WSO2", async () => {
    server.wso2.respond = () => ({ status: 200, data: { list: [] } });
    const res = await server.get("/apis?limit=200&offset=25");
    assert.equal(res.status, 200);
    assert.equal(server.wso2.calls.at(-1)?.path, "/apis?limit=200&offset=25");
  });

  it("rejects bad paging values without calling WSO2", async () => {
    server.wso2.calls.length = 0;
    for (const qs of ["limit=-1", "limit=abc", "limit=5000", "offset=1.5", "limit=1&limit=2"]) {
      assert.equal((await server.get(`/apis?${qs}`)).status, 400, qs);
    }
    assert.equal(server.wso2.calls.length, 0);
  });
});

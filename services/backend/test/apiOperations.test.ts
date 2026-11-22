import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { toOperations } from "../src/services/apiOperations";
import { startTestServer, type TestServer } from "./helpers";

/** Shaped like what WSO2 returns: path-level parameters, $refs, WSO2's x- fields. */
const OPENAPI_3 = {
  openapi: "3.0.1",
  paths: {
    "/order/{orderId}": {
      parameters: [{ $ref: "#/components/parameters/OrderId" }],
      get: {
        summary: "Get an order",
        description: "Returns one order.",
        parameters: [
          { name: "fields", in: "query", schema: { type: "array", items: { type: "string" } } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { example: { orderId: "o-1", size: "large" } } },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
        security: [{ default: [] }],
        "x-auth-type": "Application & Application User",
        "x-throttling-tier": "Unlimited",
      },
      put: {
        parameters: [{ name: "orderId", in: "path", description: "Overrides the shared one" }],
        requestBody: { $ref: "#/components/requestBodies/Order" },
        responses: { "200": { description: "Updated" } },
      },
    },
    "/menu": {
      get: {
        parameters: [
          {
            name: "size",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["small", "large"], default: "small" },
            example: "large",
          },
          { name: "X-Ignored", in: "nowhere" },
          { $ref: "#/components/parameters/Plain" },
          { $ref: "#/components/parameters/Missing" },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { examples: { first: { value: [{ name: "Margherita" }] } } } },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      OrderId: { name: "orderId", in: "path", description: "Order ID", schema: { type: "string", format: "uuid" } },
      Plain: { name: "plain", in: "query", schema: { type: "string", format: "string" } },
    },
    responses: { NotFound: { description: "No such order" } },
    requestBodies: {
      Order: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
      },
    },
    schemas: {
      Order: {
        type: "object",
        required: ["size"],
        example: { size: "large", toppings: ["olives"] },
        properties: {
          size: { type: "string", description: "Pizza size" },
          toppings: { type: "array", items: { type: "string" } },
          customer: { $ref: "#/components/schemas/Customer" },
        },
      },
      Customer: { type: "object", properties: { name: { type: "string" } } },
    },
  },
};

describe("toOperations", () => {
  const operations = toOperations(OPENAPI_3);
  const find = (method: string, path: string) =>
    operations.find((o) => o.method === method && o.path === path);

  it("lists every operation in definition order", () => {
    assert.deepEqual(
      operations.map((o) => `${o.method} ${o.path}`),
      ["GET /order/{orderId}", "PUT /order/{orderId}", "GET /menu"],
    );
  });

  it("merges path-level parameters and resolves $refs", () => {
    const get = find("GET", "/order/{orderId}");
    assert.equal(get?.summary, "Get an order");
    assert.equal(get?.description, "Returns one order.");
    assert.deepEqual(get?.parameters, [
      { name: "orderId", in: "path", required: true, description: "Order ID", type: "string (uuid)" },
      { name: "fields", in: "query", required: false, type: "array of string" },
    ]);
  });

  it("lets an operation override a shared parameter", () => {
    assert.deepEqual(find("PUT", "/order/{orderId}")?.parameters, [
      { name: "orderId", in: "path", required: true, description: "Overrides the shared one" },
    ]);
  });

  it("keeps enums, defaults and examples, and drops invalid parameters", () => {
    assert.deepEqual(find("GET", "/menu")?.parameters, [
      {
        name: "size",
        in: "query",
        required: false,
        type: "string",
        enum: ["small", "large"],
        example: "large",
        default: "small",
      },
      { name: "plain", in: "query", required: false, type: "string" },
    ]);
  });

  it("describes request bodies from their schema", () => {
    assert.deepEqual(find("PUT", "/order/{orderId}")?.requestBody, {
      contentType: "application/json",
      required: true,
      fields: [
        { name: "size", required: true, type: "string", description: "Pizza size" },
        { name: "toppings", required: false, type: "array of string" },
        { name: "customer", required: false, type: "object" },
      ],
      example: { size: "large", toppings: ["olives"] },
    });
  });

  it("includes response descriptions and examples", () => {
    assert.deepEqual(find("GET", "/order/{orderId}")?.responses, [
      { status: "200", description: "OK", example: { orderId: "o-1", size: "large" } },
      { status: "404", description: "No such order" },
    ]);
    assert.deepEqual(find("GET", "/menu")?.responses, [
      { status: "200", description: "OK", example: [{ name: "Margherita" }] },
    ]);
  });

  it("reads Swagger 2 parameters and body parameters", () => {
    const [op] = toOperations({
      swagger: "2.0",
      paths: {
        "/pets": {
          post: {
            parameters: [
              { name: "dryRun", in: "query", type: "boolean" },
              { name: "body", in: "body", required: true, schema: { $ref: "#/definitions/Pet" } },
            ],
            responses: { "201": { description: "Created", examples: { "application/json": { id: 1 } } } },
          },
        },
      },
      definitions: { Pet: { type: "object", properties: { name: { type: "string" } } } },
    });
    assert.deepEqual(op.parameters, [{ name: "dryRun", in: "query", required: false, type: "boolean" }]);
    assert.deepEqual(op.requestBody, {
      contentType: "application/json",
      required: true,
      fields: [{ name: "name", required: false, type: "string" }],
    });
    assert.deepEqual(op.responses, [{ status: "201", description: "Created", example: { id: 1 } }]);
  });

  it("survives $ref cycles, external refs and junk", () => {
    const cyclic = {
      paths: {
        "/a": {
          get: {
            parameters: [{ $ref: "#/components/parameters/A" }, { $ref: "https://example.com/p.json" }],
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Loop" } } } },
            responses: {},
          },
        },
      },
      components: {
        parameters: { A: { $ref: "#/components/parameters/A" } },
        schemas: { Loop: { $ref: "#/components/schemas/Loop" } },
      },
    };
    assert.deepEqual(toOperations(cyclic), [
      {
        method: "GET",
        path: "/a",
        parameters: [],
        requestBody: { contentType: "application/json", required: false, fields: [] },
        responses: [],
      },
    ]);
    for (const junk of [null, "nope", 42, [], {}, { paths: [] }, { paths: { "/x": "y" } }]) {
      assert.deepEqual(toOperations(junk), []);
    }
  });
});

describe("GET /apis/:id/operations", () => {
  let server: TestServer;
  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  it("reads the definition from WSO2 and returns its operations", async () => {
    server.wso2.respond = () => ({ status: 200, data: OPENAPI_3 });
    const res = await server.get("/apis/api%201/operations");
    assert.equal(res.status, 200);
    assert.equal(res.body.operations.length, 3);
    assert.deepEqual(server.wso2.calls.at(-1), {
      method: "GET",
      path: "/apis/api%201/swagger",
      authorization: undefined,
    });
  });
});

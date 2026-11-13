/**
 * OpenAPI 3.1 description of the OpenGate backend, served at /openapi.json.
 * Hand-written; test/openapi.test.ts checks it covers every route.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ "application/json": { schema } });
const body = (schema: unknown) => ({ required: true, content: json(schema) });
const ok = (description: string, schema?: unknown) =>
  schema ? { description, content: json(schema) } : { description };
const error = (description: string) => ok(description, ref("Error"));

const user = [{ openGate: [] }];
const userAndWso2 = [{ openGate: [], wso2: [] }];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

const errors = {
  "400": error("Invalid input"),
  "401": error("Missing or invalid token"),
  "404": error("Not found, or owned by another user"),
  "502": error("WSO2 is unreachable or replied unexpectedly"),
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "OpenGate backend",
    version: "1.0.0",
    description:
      "Developer gateway in front of WSO2 API Manager. WSO2 errors are passed through " +
      "with their status, and WSO2's body in `details`.",
  },
  components: {
    securitySchemes: {
      openGate: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      wso2: {
        type: "apiKey",
        in: "header",
        name: "X-WSO2-Authorization",
        description: "`Bearer <WSO2 token>`, forwarded unchanged to WSO2.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
          details: {},
          requestId: { type: "string", description: "Only on 500 responses" },
        },
      },
      User: {
        type: "object",
        required: ["id", "email"],
        properties: { id: { type: "string" }, email: { type: "string" } },
      },
      Credentials: {
        type: "object",
        required: ["email", "password"],
        properties: { email: { type: "string" }, password: { type: "string", minLength: 8 } },
      },
      Application: {
        type: "object",
        required: ["id", "ownerId", "wso2ApplicationId", "name", "description", "throttlingPolicy", "createdAt"],
        properties: {
          id: { type: "string" },
          ownerId: { type: "string" },
          wso2ApplicationId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          throttlingPolicy: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ApplicationKey: {
        type: "object",
        required: ["keyType", "consumerKey", "supportedGrantTypes"],
        properties: {
          keyType: { type: "string", enum: ["PRODUCTION", "SANDBOX"] },
          keyMappingId: { type: "string" },
          consumerKey: { type: "string" },
          consumerSecret: { type: "string", description: "Only when just generated" },
          keyManager: { type: "string" },
          keyState: { type: "string" },
          supportedGrantTypes: { type: "array", items: { type: "string" } },
        },
      },
      Subscription: {
        type: "object",
        required: ["subscriptionId", "apiId"],
        properties: {
          subscriptionId: { type: "string" },
          apiId: { type: "string" },
          apiName: { type: "string" },
          apiVersion: { type: "string" },
          apiContext: { type: "string" },
          throttlingPolicy: { type: "string" },
          status: { type: "string" },
        },
      },
      ThrottlingPolicy: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          displayName: { type: "string" },
          description: { type: "string" },
          requestCount: { type: "integer" },
          unitTime: { type: "integer" },
          timeUnit: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: { summary: "Liveness", responses: { "200": ok("Running", { type: "object" }) } },
    },
    "/ready": {
      get: {
        summary: "Readiness: MongoDB and WSO2 are reachable",
        responses: {
          "200": ok("Ready", { type: "object" }),
          "503": ok("A dependency failed; `checks` names it", { type: "object" }),
        },
      },
    },
    "/openapi.json": {
      get: { summary: "This document", responses: { "200": ok("OpenAPI 3.1", { type: "object" }) } },
    },
    "/apis": {
      get: { summary: "Public APIs published in WSO2 (WSO2's response, relayed)", responses: { "200": ok("WSO2 API list", { type: "object" }) } },
    },
    "/apis/{id}": {
      get: {
        summary: "One WSO2 API, including its subscription tiers",
        parameters: [idParam],
        responses: { "200": ok("WSO2 API", { type: "object" }), "404": errors["404"] },
      },
    },
    "/auth/register": {
      post: {
        summary: "Create an account (rate-limited)",
        requestBody: body(ref("Credentials")),
        responses: {
          "201": ok("Registered", { type: "object", properties: { user: ref("User") } }),
          "400": errors["400"],
          "409": error("Email already registered"),
          "429": error("Too many attempts"),
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Get a 15-minute access token (rate-limited)",
        requestBody: body(ref("Credentials")),
        responses: {
          "200": ok("Signed in", {
            type: "object",
            properties: {
              accessToken: { type: "string" },
              tokenType: { const: "Bearer" },
              expiresIn: { type: "integer" },
              user: ref("User"),
            },
          }),
          "401": error("Wrong email or password"),
          "429": error("Too many attempts"),
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "The signed-in user",
        security: user,
        responses: { "200": ok("User", { type: "object", properties: { user: ref("User") } }), "401": errors["401"] },
      },
    },
    "/auth/password": {
      post: {
        summary: "Change your password (rate-limited)",
        security: user,
        requestBody: body({
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 8 } },
        }),
        responses: {
          "204": ok("Changed"),
          "400": errors["400"],
          "401": errors["401"],
          "403": error("Current password is incorrect"),
          "429": error("Too many attempts"),
        },
      },
    },
    "/throttling-policies/{level}": {
      get: {
        summary: "WSO2 throttling policies at one level",
        security: userAndWso2,
        parameters: [
          { name: "level", in: "path", required: true, schema: { enum: ["application", "subscription"] } },
        ],
        responses: {
          "200": ok("Policies", { type: "object", properties: { policies: { type: "array", items: ref("ThrottlingPolicy") } } }),
          "401": errors["401"],
          "404": error("Unknown level"),
        },
      },
    },
    "/applications": {
      get: {
        summary: "Your applications, newest first",
        security: user,
        responses: {
          "200": ok("Applications", { type: "object", properties: { applications: { type: "array", items: ref("Application") } } }),
          "401": errors["401"],
        },
      },
      post: {
        summary: "Create an application in WSO2 and record you as its owner",
        security: userAndWso2,
        requestBody: body({
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            throttlingPolicy: { type: "string", default: "Unlimited" },
          },
        }),
        responses: {
          "201": ok("Created", { type: "object", properties: { application: ref("Application") } }),
          "400": errors["400"],
          "401": errors["401"],
          "409": error("Name taken in WSO2"),
          "502": errors["502"],
        },
      },
    },
    "/applications/{id}": {
      parameters: [idParam],
      get: {
        summary: "One of your applications",
        security: user,
        responses: { "200": ok("Application", { type: "object", properties: { application: ref("Application") } }), "401": errors["401"], "404": errors["404"] },
      },
      patch: {
        summary: "Rename, re-describe or change the policy of an application",
        security: userAndWso2,
        requestBody: body({
          type: "object",
          minProperties: 1,
          properties: { name: { type: "string" }, description: { type: "string" }, throttlingPolicy: { type: "string" } },
        }),
        responses: { "200": ok("Updated", { type: "object", properties: { application: ref("Application") } }), ...errors },
      },
      delete: {
        summary: "Delete the application from WSO2 and OpenGate",
        security: userAndWso2,
        responses: { "204": ok("Deleted"), "401": errors["401"], "404": errors["404"], "502": errors["502"] },
      },
    },
    "/applications/{id}/keys": {
      parameters: [idParam],
      get: {
        summary: "The application's OAuth clients (never secrets)",
        security: userAndWso2,
        responses: { "200": ok("Keys", { type: "object", properties: { keys: { type: "array", items: ref("ApplicationKey") } } }), "401": errors["401"], "404": errors["404"] },
      },
      post: {
        summary: "Generate client-credentials keys; the secret is returned only here",
        security: userAndWso2,
        requestBody: body({ type: "object", required: ["keyType"], properties: { keyType: { enum: ["PRODUCTION", "SANDBOX"] } } }),
        responses: {
          "201": ok("Generated", { type: "object", properties: { key: ref("ApplicationKey") } }),
          ...errors,
          "409": error("Keys already exist for that key type"),
        },
      },
    },
    "/applications/{id}/keys/{keyMappingId}/regenerate-secret": {
      parameters: [idParam, { name: "keyMappingId", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Replace a consumer secret; the old one stops working",
        security: userAndWso2,
        responses: {
          "200": ok("New secret", {
            type: "object",
            properties: { key: { type: "object", properties: { consumerKey: { type: "string" }, consumerSecret: { type: "string" } } } },
          }),
          "401": errors["401"],
          "404": errors["404"],
          "502": errors["502"],
        },
      },
    },
    "/applications/{id}/subscriptions": {
      parameters: [idParam],
      get: {
        summary: "The APIs this application is subscribed to",
        security: userAndWso2,
        responses: { "200": ok("Subscriptions", { type: "object", properties: { subscriptions: { type: "array", items: ref("Subscription") } } }), "401": errors["401"], "404": errors["404"] },
      },
      post: {
        summary: "Subscribe the application to an API",
        security: userAndWso2,
        requestBody: body({
          type: "object",
          required: ["apiId"],
          properties: { apiId: { type: "string" }, throttlingPolicy: { type: "string", default: "Unlimited" } },
        }),
        responses: {
          "201": ok("Subscribed", { type: "object", properties: { subscription: ref("Subscription") } }),
          ...errors,
          "409": error("Already subscribed"),
        },
      },
    },
    "/applications/{id}/subscriptions/{subscriptionId}": {
      parameters: [idParam, { name: "subscriptionId", in: "path", required: true, schema: { type: "string" } }],
      delete: {
        summary: "Unsubscribe (404 unless the subscription belongs to this application)",
        security: userAndWso2,
        responses: { "204": ok("Removed"), "401": errors["401"], "404": errors["404"] },
      },
    },
  },
} as const;

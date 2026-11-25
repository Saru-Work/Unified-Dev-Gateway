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
      "with their status, and WSO2's body in `details`. OpenGate calls WSO2 with its own " +
      "service account, so clients only ever send their OpenGate token.",
  },
  components: {
    securitySchemes: {
      openGate: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
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
      Session: {
        type: "object",
        required: ["accessToken", "tokenType", "expiresIn", "refreshToken", "refreshExpiresIn", "user"],
        properties: {
          accessToken: { type: "string" },
          tokenType: { const: "Bearer" },
          expiresIn: { type: "integer", description: "Seconds the access token lasts (900)" },
          refreshToken: { type: "string", description: "Single use; send to POST /auth/refresh" },
          refreshExpiresIn: { type: "integer", description: "Seconds the refresh token lasts (30 days)" },
          user: ref("User"),
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } },
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
      ApiOperation: {
        type: "object",
        required: ["method", "path", "parameters", "responses"],
        properties: {
          method: { type: "string", examples: ["GET"] },
          path: { type: "string", examples: ["/posts/{id}"] },
          summary: { type: "string" },
          description: { type: "string" },
          parameters: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "in", "required"],
              properties: {
                name: { type: "string" },
                in: { enum: ["path", "query", "header", "cookie"] },
                required: { type: "boolean" },
                description: { type: "string" },
                type: { type: "string", examples: ["integer", "array of string"] },
                enum: { type: "array", items: { type: "string" } },
                example: {},
                default: {},
              },
            },
          },
          requestBody: {
            type: "object",
            required: ["contentType", "required", "fields"],
            properties: {
              contentType: { type: "string" },
              required: { type: "boolean" },
              description: { type: "string" },
              fields: {
                type: "array",
                items: {
                  type: "object",
                  required: ["name", "required"],
                  properties: {
                    name: { type: "string" },
                    required: { type: "boolean" },
                    type: { type: "string" },
                    description: { type: "string" },
                  },
                },
              },
              example: {},
            },
          },
          responses: {
            type: "array",
            items: {
              type: "object",
              required: ["status"],
              properties: { status: { type: "string" }, description: { type: "string" }, example: {} },
            },
          },
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
      ApiHealth: {
        type: "object",
        required: ["apiId", "status"],
        properties: {
          apiId: { type: "string" },
          status: { enum: ["operational", "degraded", "down", "unknown"] },
          successRate: { type: "number", minimum: 0, maximum: 1, description: "Share of calls that weren't 5xx" },
          avgLatencyMs: { type: "integer" },
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
      get: {
        summary: "Public APIs published in WSO2 (WSO2's response, relayed)",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 0, maximum: 1000 }, description: "Page size; WSO2's default is 25" },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": ok("WSO2 API list", { type: "object" }), "400": errors["400"] },
      },
    },
    "/apis/health": {
      get: {
        summary: "How each recently called API is doing, judged by real gateway traffic",
        description:
          "Covers the last 6 hours across all applications; only 5xx responses count against an API. " +
          "`unknown` means too few calls to judge, and APIs with none are left out. " +
          "`{ enabled: false }` when the backend isn't collecting usage.",
        responses: {
          "200": ok("Health", {
            type: "object",
            required: ["enabled"],
            properties: {
              enabled: { type: "boolean" },
              windowHours: { type: "integer" },
              apis: { type: "array", items: ref("ApiHealth") },
            },
          }),
        },
      },
    },
    "/apis/popular": {
      get: {
        summary: "The most widely used APIs of the last 30 days",
        description:
          "Ranked by how many applications called them successfully, then by calls. " +
          "`{ enabled: false }` when the backend isn't collecting usage.",
        responses: {
          "200": ok("Popular APIs, most used first", {
            type: "object",
            required: ["enabled"],
            properties: {
              enabled: { type: "boolean" },
              days: { type: "integer" },
              apis: {
                type: "array",
                maxItems: 100,
                items: {
                  type: "object",
                  required: ["apiId", "applications"],
                  properties: { apiId: { type: "string" }, applications: { type: "integer" } },
                },
              },
            },
          }),
        },
      },
    },
    "/apis/{id}": {
      get: {
        summary: "One WSO2 API, including its subscription tiers",
        parameters: [idParam],
        responses: { "200": ok("WSO2 API", { type: "object" }), "404": errors["404"] },
      },
    },
    "/apis/{id}/operations": {
      get: {
        summary: "The API's endpoints, parameters and examples, read from its OpenAPI definition in WSO2",
        parameters: [idParam],
        responses: {
          "200": ok("Operations", {
            type: "object",
            properties: { operations: { type: "array", items: ref("ApiOperation") } },
          }),
          "404": errors["404"],
        },
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
        summary: "Get a 15-minute access token and a refresh token (rate-limited)",
        requestBody: body(ref("Credentials")),
        responses: {
          "200": ok("Signed in", ref("Session")),
          "401": error("Wrong email or password"),
          "429": error("Too many attempts"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Swap a refresh token for a new access token and the next refresh token",
        description:
          "Each refresh token works once. Reusing one after the next has been issued (beyond a few seconds' grace) signs that session out everywhere.",
        requestBody: body(ref("RefreshRequest")),
        responses: {
          "200": ok("Refreshed", ref("Session")),
          "400": errors["400"],
          "401": error("Refresh token invalid, used, revoked or expired"),
          "429": error("Too many requests"),
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "End the session a refresh token belongs to",
        requestBody: body(ref("RefreshRequest")),
        responses: { "204": ok("Signed out"), "400": errors["400"], "429": error("Too many requests") },
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
        summary: "Change your password and sign out other sessions (rate-limited)",
        security: user,
        requestBody: body({
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string" },
            newPassword: { type: "string", minLength: 8 },
            refreshToken: {
              type: "string",
              description: "Keep this session signed in; every other session is signed out.",
            },
          },
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
    "/saved-apis": {
      get: {
        summary: "The APIs you've saved, most recent first",
        security: user,
        responses: {
          "200": ok("Saved APIs", {
            type: "object",
            properties: {
              apis: {
                type: "array",
                items: {
                  type: "object",
                  required: ["apiId", "savedAt"],
                  properties: { apiId: { type: "string" }, savedAt: { type: "string", format: "date-time" } },
                },
              },
            },
          }),
          "401": errors["401"],
        },
      },
    },
    "/saved-apis/{apiId}": {
      parameters: [{ name: "apiId", in: "path", required: true, schema: { type: "string" } }],
      put: {
        summary: "Save an API (repeating it changes nothing)",
        security: user,
        responses: { "204": ok("Saved"), "401": errors["401"], "404": error("No such public API"), "502": errors["502"] },
      },
      delete: {
        summary: "Remove a saved API, even one no longer published",
        security: user,
        responses: { "204": ok("Removed"), "401": errors["401"] },
      },
    },
    "/throttling-policies/{level}": {
      get: {
        summary: "WSO2 throttling policies at one level",
        security: user,
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
        security: user,
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
        security: user,
        requestBody: body({
          type: "object",
          minProperties: 1,
          properties: { name: { type: "string" }, description: { type: "string" }, throttlingPolicy: { type: "string" } },
        }),
        responses: { "200": ok("Updated", { type: "object", properties: { application: ref("Application") } }), ...errors },
      },
      delete: {
        summary: "Delete the application from WSO2 and OpenGate",
        security: user,
        responses: { "204": ok("Deleted"), "401": errors["401"], "404": errors["404"], "502": errors["502"] },
      },
    },
    "/applications/{id}/keys": {
      parameters: [idParam],
      get: {
        summary: "The application's OAuth clients (never secrets)",
        security: user,
        responses: { "200": ok("Keys", { type: "object", properties: { keys: { type: "array", items: ref("ApplicationKey") } } }), "401": errors["401"], "404": errors["404"] },
      },
      post: {
        summary: "Generate client-credentials keys; the secret is returned only here",
        security: user,
        requestBody: body({ type: "object", required: ["keyType"], properties: { keyType: { enum: ["PRODUCTION", "SANDBOX"] } } }),
        responses: {
          "201": ok("Generated", { type: "object", properties: { key: ref("ApplicationKey") } }),
          ...errors,
          "409": error("Keys already exist for that key type"),
        },
      },
    },
    "/applications/{id}/keys/{keyMappingId}": {
      parameters: [idParam, { name: "keyMappingId", in: "path", required: true, schema: { type: "string" } }],
      delete: {
        summary: "Delete one environment's keys so new ones can be generated",
        description:
          "WSO2 revokes the consumer secret and every access token issued from these keys.",
        security: user,
        responses: { "204": ok("Deleted"), "401": errors["401"], "404": errors["404"], "502": errors["502"] },
      },
    },
    "/applications/{id}/keys/{keyMappingId}/regenerate-secret": {
      parameters: [idParam, { name: "keyMappingId", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Replace a consumer secret; the old one stops working",
        security: user,
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
    "/applications/{id}/keys/{keyMappingId}/token": {
      parameters: [idParam, { name: "keyMappingId", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Get an access token for calling subscribed APIs with these keys",
        description:
          "OpenGate doesn't store consumer secrets, so send the one shown when the keys were generated. " +
          "Use the token as `Authorization: Bearer …` on the WSO2 gateway.",
        security: user,
        requestBody: {
          required: true,
          content: json({
            type: "object",
            required: ["consumerSecret"],
            properties: { consumerSecret: { type: "string" } },
          }),
        },
        responses: {
          "200": ok("Access token", {
            type: "object",
            properties: {
              token: {
                type: "object",
                required: ["accessToken", "tokenType", "expiresIn", "scopes"],
                properties: {
                  accessToken: { type: "string" },
                  tokenType: { const: "Bearer" },
                  expiresIn: { type: "integer", description: "Seconds" },
                  scopes: { type: "array", items: { type: "string" } },
                },
              },
            },
          }),
          "400": error("Missing consumerSecret, or WSO2 refused it for these keys"),
          "401": errors["401"],
          "404": errors["404"],
          "502": errors["502"],
        },
      },
    },
    "/applications/{id}/usage": {
      parameters: [idParam],
      get: {
        summary: "Calls this application made through the gateway",
        description:
          "From the WSO2 gateway's analytics log. `{ enabled: false }` when the backend isn't collecting it. " +
          "Hourly buckets for 24h, daily for 7d and 30d (UTC). Kept for 30 days.",
        security: user,
        parameters: [{ name: "range", in: "query", schema: { enum: ["24h", "7d", "30d"], default: "24h" } }],
        responses: {
          "200": ok("Usage", { type: "object" }),
          "400": errors["400"],
          "401": errors["401"],
          "404": errors["404"],
        },
      },
    },
    "/usage": {
      get: {
        summary: "Calls all your applications made through the gateway",
        description:
          "Like /applications/{id}/usage, plus `applications`: calls and errors for each one, busiest first.",
        security: user,
        parameters: [{ name: "range", in: "query", schema: { enum: ["24h", "7d", "30d"], default: "24h" } }],
        responses: { "200": ok("Usage", { type: "object" }), "400": errors["400"], "401": errors["401"] },
      },
    },
    "/usage.csv": {
      get: {
        summary: "The same calls as CSV: one line per time bucket, application, API and status",
        security: user,
        parameters: [{ name: "range", in: "query", schema: { enum: ["24h", "7d", "30d"], default: "24h" } }],
        responses: {
          "200": { description: "CSV", content: { "text/csv": { schema: { type: "string" } } } },
          "400": errors["400"],
          "401": errors["401"],
          "404": error("Usage isn't being collected"),
        },
      },
    },
    "/applications/{id}/subscriptions": {
      parameters: [idParam],
      get: {
        summary: "The APIs this application is subscribed to",
        security: user,
        responses: { "200": ok("Subscriptions", { type: "object", properties: { subscriptions: { type: "array", items: ref("Subscription") } } }), "401": errors["401"], "404": errors["404"] },
      },
      post: {
        summary: "Subscribe the application to an API",
        security: user,
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
        security: user,
        responses: { "204": ok("Removed"), "401": errors["401"], "404": errors["404"] },
      },
    },
  },
} as const;

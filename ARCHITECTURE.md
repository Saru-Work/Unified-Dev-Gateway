# OpenGate (Unified Dev Gateway): Architecture

OpenGate is an API marketplace built on **WSO2 API Manager**: one account,
one catalog, one set of credentials for many APIs. WSO2 runs the APIs
(security, subscriptions, throttling, the gateway); OpenGate is the
developer-facing layer on top. Developers sign up with OpenGate, and the
backend does every WSO2 operation for them with its own service account,
recording who owns each application so a user only ever sees their own. For
upstream APIs that need a provider key, the key lives in WSO2 and the gateway
injects it, so developers only use their OpenGate-issued token.

> Status: the backend and the dashboard are the working core, used end to
> end against WSO2 4.7.0. `packages/sdk` and `services/sidecar` are empty
> placeholders, and the CI workflow is empty. See
> [Known gaps](#6-known-gaps-and-next-steps).

---

## 1. System overview

```
                         ┌──────────────────────────────────────────────┐
                         │          docker network: devgateway          │
                         │                                              │
 Browser ──:3000──────▶  │  dashboard (Next.js 16, server-side calls)   │
                         │      │ BACKEND_URL                           │
                         │      ▼                                       │
 API client ─:4000────▶  │  backend (Express 5 / Node 22) ──────┐       │
                         │      │                ▲              │ HTTPS │
                         │      │ mongodb://     │ apim_metrics │       │
                         │      ▼ mongo:27017    │ .log (ro)    ▼       │
                         │  mongo (MongoDB 8)    └──── wso2am (WSO2 APIM│
                         │   users, applications,      4.7.0) DevPortal │
                         │   usage events              REST API v3      │
                         └───────────────────────────────────┬──────────┘
 Your app ──access token──▶ :8243 WSO2 gateway ──────────────┘
                            (+ provider key) ──▶ upstream APIs
                                  WSO2 also exposes :9443 (portals/admin)
                                  and :8280 (gateway HTTP)
```

| Service       | Image / build          | Port(s)            | Role |
|---------------|------------------------|--------------------|------|
| `wso2am`      | `wso2/wso2am:4.7.0`    | 9443, 8243, 8280   | API Manager: publishes APIs, owns applications, keys, subscriptions, throttling, provider-key injection, and the runtime gateway. Started through `wso2-config/wso2-start.sh` (§5). |
| `wso2am-init` | `busybox:1.37.0`       | none (one-shot)    | Hands the `solr` volume to WSO2's user before WSO2 starts. |
| `mongo`       | `mongo:8`              | internal only      | OpenGate's own data: accounts, application ownership, usage events. |
| `backend`     | `services/backend`     | 4000               | OpenGate API: authentication, ownership, a typed facade over the WSO2 DevPortal API, and the usage collector. |
| `dashboard`   | `dashboard`            | 3000               | Developer UI: landing page, user guide, catalog, applications, keys, subscriptions, usage. |

**Startup order** (from `docker-compose.yml`): `wso2am` waits for
`wso2am-init` to finish; `backend` waits until both `wso2am` (startup health
check) and `mongo` (`ping`) report healthy; `dashboard` waits until `backend`
is healthy, meaning its `/ready` passes. WSO2 needs up to about 2 minutes to
start (`start_period: 120s`).

**Ports** are published on `127.0.0.1` only. On a server, nginx on the host
is the public entry point (`deploy/nginx/opengate.conf`, README §9): the
dashboard, the WSO2 Publisher with its sign-in (other WSO2 consoles behind an
IP allowlist; the DevPortal, SOAP admin services and DCR never public), the
gateway, and optionally the backend API. Docker-published ports bypass host
firewalls such as ufw, hence loopback.

**Persistent volumes:** `mongo-data`, `wso2am-470-deployment` (deployed
artifacts), `wso2am-470-database` (WSO2's embedded H2 databases, plus the
pinned encryption key), `wso2am-470-solr` (WSO2's API search index) and
`wso2am-470-logs` (WSO2's logs, mounted read-only into the backend for usage).

---

## 2. Repository layout

```
.
├── docker-compose.yml        # Whole stack
├── .env.example              # JWT_SECRET, WSO2 account, encryption key, provider keys (copy to .env)
├── README.md                 # Setup and usage guide
├── ARCHITECTURE.md           # This file
├── ABOUT.txt                 # Short plain-text summary
├── whatisopengate.txt        # Non-technical overview
├── dashboard/                # Next.js 16 developer portal (see §4)
├── services/backend/         # OpenGate backend (see §3)
├── services/sidecar/         # Placeholder (empty Dockerfile)
├── packages/sdk/             # Placeholder for a client SDK (empty)
├── deploy/nginx/            # nginx config for hosting on a server (README §9)
├── scripts/
│   ├── public-apis/          # One OpenAPI 3 file per sample API, with an x-opengate block
│   ├── seed-public-apis.sh   # Publishes them in WSO2 (provider keys, shared limits, policies)
│   ├── record-examples.mjs   # Calls each endpoint and records real example responses
│   └── wso2-policies/        # opengateRedactQueryParams response policy
├── wso2-config/
│   ├── wso2-start.sh         # WSO2 entrypoint wrapper (analytics, re-index, encryption key)
│   └── apis/, sequences/     # Set aside for WSO2 artifacts (empty, not mounted)
├── .github/workflows/ci.yml  # Empty so far
└── backups/                  # Local backup of the old WSO2 4.4.0 setup (untracked)
```

---

## 3. Backend (`services/backend`)

TypeScript 7, Express 5, Mongoose 9, CommonJS output in `dist/`.

### 3.1 Layers

The code is layered, and each layer depends only on the layer below it.
Everything is wired together in one place (`createApp`), so tests can swap
in fakes.

```
            HTTP request
                 │
   ┌─────────────▼──────────────┐
   │ routes/        (Router)    │  URL → middleware → controller method
   ├────────────────────────────┤
   │ security/requireAuth       │  Verifies OpenGate JWT → res.locals.userId
   ├────────────────────────────┤
   │ controllers/               │  Parse & validate HTTP input, shape response
   ├────────────────────────────┤
   │ services/                  │  Business rules (auth, ownership, rollback)
   ├──────────────┬─────────────┤
   │ repositories/│ integrations│  Persistence (Mongo) │ External APIs (WSO2)
   │ models/      │ /wso2       │
   └──────────────┴─────────────┘
                 │
   errors/errorHandler  ◀── every thrown error ends up here
```

| Path | Responsibility |
|------|----------------|
| `src/index.ts` | Entry point: load config, connect to Mongo, build the real dependencies, `listen`. Exits with code 1 if startup fails. |
| `src/app.ts` | `createApp(deps)`: builds the Express app from `AppDependencies` (`users`, `applications`, `passwords`, `tokens`, `wso2`, and optionally `log` and `readinessChecks`). Has no I/O of its own. |
| `src/config.ts` | Reads and validates environment variables (§3.6). |
| `src/routes/` | `authRouter` (adds rate limiting), `applicationRouter` and `policyRouter` (all routes need auth). |
| `src/openapi.ts` | The OpenAPI 3.1 document served at `/openapi.json`. A test checks it documents exactly the registered routes. |
| `src/observability/` | `requestLogging` (request ids, one JSON log line per request, the `Logger` type) and `readiness` (`/ready`). |
| `src/controllers/` | `AuthController` and `ApplicationController`. Handlers are arrow functions, so they can be passed directly as route handlers. |
| `src/services/` | `AuthService` (register/login/me), `Wso2ApplicationService` (create/list/get/update/delete, OAuth keys, ownership) and `SubscriptionService` (an app's WSO2 subscriptions; uses `Wso2ApplicationService.get` for ownership) and `PolicyService` (WSO2 throttling policies). |
| `src/repositories/` | `IUserRepository` / `IApplicationRepository` interfaces and their Mongo implementations. Return plain records (`PublicUser`, `ApplicationRecord`), never Mongoose documents. |
| `src/models/` | Mongoose schemas: `User`, `Application`, `UsageEvent` (§3.4). |
| `src/usage/` | The usage pipeline (§3.4): `metricsLog` (parses gateway analytics lines), `MetricsLogCollector` (follows the log), `UsageRepository` (stores and aggregates events), `summarize` (fills buckets, computes totals). Started from `index.ts` only when `USAGE_METRICS_LOG` is set. |
| `src/security/` | `PasswordHasher` (argon2), `UserTokenService` (JWT via `jose`), `requireAuth` middleware. |
| `src/integrations/wso2/client.ts` | `Wso2Transport` interface plus the axios-based `Wso2Client` (10s timeout, no redirects, optional self-signed TLS). |
| `src/integrations/wso2/Wso2TokenProvider.ts` | `Wso2TokenProvider` (the backend's own WSO2 token: DCR, password grant, caching) and `RetryWithFreshToken` (retries once on a WSO2 `401`). |
| `src/errors/` | `AppError(statusCode, message)` and the central `errorHandler`. |

**Why use interfaces at the boundaries?** Services depend on
`IUserRepository`, `IApplicationRepository` and `Wso2Transport`, not on
Mongo or axios directly. That lets the test suite run the whole HTTP stack
against in-memory fakes, with no Mongo or WSO2 needed.

### 3.2 HTTP API

All bodies are JSON. Errors always have the shape `{ "message": string, "details"?: unknown }`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET`  | `/health` | none | Liveness: `{ "status": "ok" }` |
| `GET`  | `/ready` | none | Readiness: pings Mongo and calls WSO2 `GET /apis` (any HTTP answer counts), in parallel with a 3s timeout each. `200 { status: "ready", checks }` or `503` with the failed check marked `"failed"`; reasons are logged only. Compose health-checks the backend with it. |
| `GET`  | `/openapi.json` | none | OpenAPI 3.1 description of this table |
| `GET`  | `/apis` | none | Proxies the WSO2 DevPortal `GET /apis` (only publicly visible APIs) |
| `GET`  | `/apis/:id` | none | Proxies `GET /apis/{id}` (details, including subscription `tiers`). The id is URL-encoded. |
| `GET`  | `/apis/:id/operations` | none | Reads `GET /apis/{id}/swagger` and flattens it with `services/apiOperations.ts` into `{ operations: [{ method, path, summary?, description?, parameters, requestBody?, responses }] }`. Handles OpenAPI 3 and Swagger 2, path-level parameters, and local `$ref`s (with a depth limit against cycles). |
| `POST` | `/auth/register` | none, rate-limited | `{ email, password }` → `201 { user }`. Password ≥ 8 chars. Email is trimmed and lowercased. Duplicate → `409`. |
| `POST` | `/auth/login` | none, rate-limited | `{ email, password }` → `{ accessToken, tokenType: "Bearer", expiresIn: 900, user }`. Unknown user and wrong password both give the same `401`. |
| `GET`  | `/auth/me` | OpenGate JWT | `{ user }` |
| `POST` | `/auth/password` | OpenGate JWT, rate-limited | `{ currentPassword, newPassword }` → `204`. Wrong current password → `403` (checked first); new one needs 8+ chars and must differ. Issued tokens stay valid until they expire. |
| `GET` | `/throttling-policies/:level` | OpenGate JWT | `level` is `application` or `subscription` (else `404`) → `{ policies: [{ name, displayName?, description?, requestCount?, unitTime?, timeUnit? }] }` |
| `POST` | `/applications` | OpenGate JWT | `{ name, description?, throttlingPolicy? }` → `201 { application }`. The policy defaults to `Unlimited`. |
| `GET`  | `/applications` | OpenGate JWT | `{ applications: [...] }`, the caller's apps, newest first |
| `GET`  | `/applications/:id` | OpenGate JWT | `{ application }`. Another user's app or an unknown/malformed id → `404` |
| `PATCH` | `/applications/:id` | OpenGate JWT | `{ name?, description?, throttlingPolicy? }` → `{ application }`. WSO2's update is a full `PUT`, so stored values (including the policy) are merged in and the token type is re-sent. WSO2 first; a refusal leaves the record unchanged. |
| `DELETE` | `/applications/:id` | OpenGate JWT | `204`. Deletes in WSO2 first (a WSO2 `404` counts as already gone), then removes the record. Ownership is checked before WSO2 is called. |
| `GET` | `/applications/:id/usage` | OpenGate JWT | `?range=24h\|7d\|30d` → `{ enabled: true, range, unit, from, to, totals: { calls, errors, throttled, errorRate, avgLatencyMs?, p95LatencyMs? }, series: [{ start, calls, errors }], apis, statuses, lastCallAt? }` (hourly buckets for 24h, daily for 7d/30d, UTC; empty buckets included). `{ enabled: false }` without `USAGE_METRICS_LOG`. Owner-checked like every application route. |
| `GET` | `/applications/:id/keys` | OpenGate JWT | `{ keys: [...] }` from WSO2 `oauth-keys`. Secrets and access tokens are never included. |
| `POST` | `/applications/:id/keys` | OpenGate JWT | `{ keyType: "PRODUCTION" \| "SANDBOX" }` → `201 { key }` with `consumerKey` **and `consumerSecret`**, the only time the secret is returned. Client-credentials grant, Resident Key Manager. Existing keys → WSO2's `409`. |
| `DELETE` | `/applications/:id/keys/:keyMappingId` | OpenGate JWT | `204`. Checks the mapping is among the app's keys first (WSO2 answers `500` for unknown ones), so a missing one is `404`. WSO2 revokes the secret and every token issued from it. |
| `POST` | `/applications/:id/keys/:keyMappingId/regenerate-secret` | OpenGate JWT | `{ key: { consumerKey, consumerSecret } }`. The old secret stops working; the new one is returned only here. Fails on WSO2 4.7.0 (key-manager error inside WSO2). |
| `POST` | `/applications/:id/keys/:keyMappingId/token` | OpenGate JWT | `{ consumerSecret }` → `{ token: { accessToken, tokenType, expiresIn, scopes } }` via WSO2 `generate-token` (1 hour). WSO2's `400` for a wrong secret becomes a clear `400`. `Cache-Control: no-store`. The secret isn't stored or logged. |
| `GET` | `/applications/:id/subscriptions` | OpenGate JWT | `{ subscriptions: [{ subscriptionId, apiId, apiName, apiVersion, apiContext, throttlingPolicy, status }] }` |
| `POST` | `/applications/:id/subscriptions` | OpenGate JWT | `{ apiId, throttlingPolicy? = "Unlimited" }` → `201 { subscription }` |
| `DELETE` | `/applications/:id/subscriptions/:subscriptionId` | OpenGate JWT | `204`. First reads the subscription from WSO2 and returns `404` unless it belongs to this app. |

`application` shape:

```json
{
  "id": "6ae985a7348dc636274f99de",
  "ownerId": "6ae985a7348dc636274f99dc",
  "wso2ApplicationId": "f3c1…",
  "name": "my-app",
  "description": "",
  "throttlingPolicy": "Unlimited",
  "createdAt": "2026-11-03T06:56:39.898Z"
}
```

**One token for clients.** `Authorization: Bearer <OpenGate JWT>` identifies
the OpenGate user. When a call has to act inside WSO2 (creating, updating and
deleting applications, everything under `keys` and `subscriptions`, and
throttling policies), the backend uses its own WSO2 token for a service
account, from `Wso2TokenProvider`:

- On first use it registers the `opengate_backend` OAuth client with WSO2
  (DCR at `/client-registration/v0.17/register`, basic auth with
  `WSO2_USERNAME`/`WSO2_PASSWORD`), unless `WSO2_CLIENT_ID`/`WSO2_CLIENT_SECRET`
  are set. It then uses the password grant at `/oauth2/token` with scopes
  `apim:subscribe apim:app_manage apim:sub_manage`.
- The token is cached until a minute before `expires_in`; concurrent callers
  share one request.
- `RetryWithFreshToken` wraps the WSO2 transport: on a WSO2 `401` it drops the
  cached token, gets a new one, and retries once.
- If no token can be had, the call fails with `502` (not WSO2's `401`, which
  would read as the user's session being bad) and the reason is logged.

Every WSO2 application belongs to that one WSO2 account, so ownership lives
only in Mongo and is checked before any WSO2 call. Names are unique per WSO2
account, so they're unique across all OpenGate users. Any
`X-WSO2-Authorization` header a client sends is ignored. Application reads
(`GET /applications[/:id]`) are served from Mongo.

### 3.3 Key flows

**Registration and login**

```
POST /auth/register
  AuthController.readCredentials   strings only (blocks {$gt:""}-style injection), normalise email
  AuthService.register             length check → argon2 hash → users.create
                                   Mongo duplicate key (11000) → AppError 409

POST /auth/login
  AuthService.login                users.findCredentials (selects +passwordHash)
                                   argon2.verify → tokens.issue(user.id) → 15-minute JWT
```

**Creating an application (with compensating rollback)**

```
client ──POST /applications──▶ requireAuth ──▶ ApplicationController.create
                                                  │ gets the service-account WSO2 token;
                                                  │ validates name, description, throttlingPolicy
                                                  ▼
                               Wso2ApplicationService.create(ownerId, input, wso2Token)
                                  1. WSO2  POST /applications
                                     {name, description, throttlingPolicy (default "Unlimited"), tokenType:"JWT"}
                                       ├─ WSO2 4xx/5xx      → error passed through with WSO2's status
                                       ├─ WSO2 unreachable  → 502
                                       └─ no applicationId  → 502
                                  2. Mongo applications.create({ownerId, wso2ApplicationId, ...})
                                       └─ fails → WSO2 DELETE /applications/{id}  (best effort,
                                                  failure is logged) → original error re-thrown
                                  3. 201 { application }
```

WSO2 and Mongo can't share a transaction, so the code writes to WSO2
first and undoes that write if the Mongo save fails. Ownership is only
recorded once the app exists in WSO2. If even the rollback fails, the log
names the orphaned WSO2 app id so someone can clean it up by hand.

### 3.4 Data model (MongoDB)

```
users                                  applications
──────────────────────────────         ─────────────────────────────────────
_id           ObjectId                 _id                ObjectId
email         string  unique,          ownerId            ObjectId → users._id  (indexed)
              lowercase, trimmed       wso2ApplicationId  string  unique
passwordHash  string  (argon2)         name               string  trimmed
createdAt / updatedAt                  description        string  default ""
                                       throttlingPolicy   string  default "Unlimited"
                                       createdAt / updatedAt
```

`usageevents` (one per gateway call: `correlationId` unique,
`wso2ApplicationId`, `apiId`, `apiName`, `resource`, `method`, `status`,
`latencyMs`, `errorType`, `timestamp`; indexed by application and time, and
deleted by a TTL index after 30 days) and `usagecursors` (how far the
collector has read each log: file → inode and byte offset).

**Usage pipeline** (`src/usage/`). WSO2's gateway, with `elk` analytics on,
writes `apimMetrics: apim:response|apim:faulty, properties :{json}` lines to
`apim_metrics.log` on a volume the backend mounts read-only.
`MetricsLogCollector` polls it every 5 seconds, reads up to 1 MB at a time,
consumes only complete lines, and saves its position; a new inode or a file
shorter than the saved offset means rotation, so it starts over.
`parseMetricLine` keeps calls that name an application (WSO2 reports
`UNKNOWN` for calls rejected before authentication) and drops the caller's
IP. Inserts are unordered and ignore duplicate correlation ids, so reading
twice is harmless. Queries group by `$dateTrunc` bucket, API and status, take
the p95 with `$percentile`, and `summarize` fills empty buckets and totals.

The repositories turn malformed ObjectId strings into `null` ("not
found") rather than letting Mongoose throw a `CastError`, which would
otherwise come back as a 500.

### 3.5 Security model

| Concern | Implementation |
|---------|----------------|
| Password storage | argon2 (library defaults, argon2id) |
| Session tokens | HS256 JWT via `jose`: `iss=opengate`, `aud=opengate-backend`, `sub=<userId>`, 15-minute expiry. Verification pins the algorithm and requires `sub`, `iat` and `exp`. `JWT_SECRET` must be at least 32 bytes or startup fails. |
| Brute force | `express-rate-limit` on `/auth/register`, `/auth/login` and `/auth/password`: 20 requests per 15 minutes per IP for each route (in memory, per instance). The client IP comes from `X-Forwarded-For` only with `TRUST_PROXY`; the dashboard forwards nginx's `X-Real-IP`. On a server, nginx also rate-limits WSO2's `/oauth2/token` and `/commonauth`. |
| User enumeration | Login gives the same 401 for an unknown email and a wrong password. Another user's application gives 404, not 403. |
| Input handling | JSON body limit 100 kB. Credentials must be strings. Malformed JSON → 400. |
| Tenant isolation | Every application query is scoped by `ownerId` from the verified JWT. |
| Error leakage | Unexpected errors → generic 500 with only a `requestId`; full details are logged on the server only. `/ready` names failed checks but not why. `x-powered-by` is disabled. |
| Logging | Request logs leave out query strings, headers and bodies, so tokens and passwords never reach them. A caller's `X-Request-Id` is only reused if it matches `[\w.:-]{1,128}`. |
| TLS to WSO2 | Certificates are verified unless `WSO2_ALLOW_SELF_SIGNED=true`. Compose sets it because WSO2 ships with a self-signed certificate. |

### 3.6 Configuration

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `MONGO_URI` | yes | none | Compose: `mongodb://mongo:27017/opengate` |
| `JWT_SECRET` | yes | none | ≥ 32 bytes. Compose reads it from the root `.env` (`openssl rand -base64 48`). |
| `WSO2_BASE_URL` | no | `https://localhost:9443/api/am/devportal/v3` | Compose: `https://wso2am:9443/...` |
| `WSO2_ALLOW_SELF_SIGNED` | no | `false` | `"true"` to accept WSO2's default certificate |
| `WSO2_USERNAME`, `WSO2_PASSWORD` | yes | none | The WSO2 account OpenGate acts as. Compose defaults both to `admin`. |
| `WSO2_CLIENT_ID`, `WSO2_CLIENT_SECRET` | no | none | Both or neither (startup fails otherwise). Without them, `opengate_backend` is registered by DCR on first use. |
| `USAGE_METRICS_LOG` | no | none | Path to WSO2's `apim_metrics.log`; usage is off (`{ enabled: false }`) without it. Compose: `/wso2-logs/apim_metrics.log`. |
| `TRUST_PROXY` | no | none | Number of proxy hops whose `X-Forwarded-For` is trusted (Express `trust proxy`). Compose sets `1`: the dashboard forwards each visitor's IP, and nginx's `api.` block sets it, so the rate limits count visitors rather than the dashboard. Unset, the header is ignored. |
| `PORT` | no | `4000` | |

The `wso2am` container also reads `WSO2_ENCRYPTION_KEY`, `WSO2_ADMIN_PASSWORD`,
`WSO2_HOSTNAME` and `WSO2_GATEWAY_HOST` (all optional; §5), and the scripts
read provider keys such as `NASA_API_KEY` from the environment or `.env`.

### 3.7 Error handling

Express 5 forwards errors from async handlers to the error middleware
automatically, so controllers just `throw`. `errorHandler` maps them in
this order:

1. `AppError` → its `statusCode` and `message`
2. axios error **with** a response (WSO2 replied) → WSO2's status, with
   `details` set to WSO2's body
3. axios error **without** a response (network failure or timeout) → `502 "WSO2 is unreachable"`
4. A client error that marks itself as exposed (e.g. body-parser's
   malformed JSON or too-large body) → its 4xx status
5. Anything else → `500 { message: "Internal server error", requestId }` (logged with the stack)

**Logging.** `requestLogging` gives each request an id, echoed in
`X-Request-Id`, and when the response finishes logs one JSON line:
`{ time, level, msg: "request", requestId, method, path, status, durationMs }`.
The level is `info`, `warn` (4xx) or `error` (5xx). The error handler and
`/ready` log through the same `Logger`, tagged with the request id. Startup
messages and the create-rollback failure still use `console`.

### 3.8 Build, test and tooling

| Command | What it does |
|---------|--------------|
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run build` | `tsc` → `dist/` (only `src/` is compiled) |
| `npm start` | `node dist/index.js` |
| `npm run lint` | `tsc -p tsconfig.test.json`: strict mode plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` and `noImplicitOverride`, applied to both `src` and `test`. (ESLint isn't used because `typescript-eslint` doesn't support TypeScript 7 yet.) |
| `npm test` | `node --import tsx --test "test/**/*.test.ts"` |

**Tests** (`test/`) start the real Express app on an ephemeral port and
call it with `fetch`. The fakes come from `test/helpers.ts`:
`InMemoryUserRepository` (mimics Mongo's duplicate-key error),
`InMemoryApplicationRepository` (can be told to fail the next create),
`fakeHasher`, and `FakeWso2` (records every call; responses are scriptable).
The test server collects log entries in `server.logs` rather than printing them.
The suite covers auth and password changes, validation, token checks, the
backend's WSO2 token (DCR, caching, retry), WSO2 pass-through and outages,
rollback, ownership isolation and ordering, keys, subscriptions, throttling
policies, API operations parsing, usage collection and summaries, logging,
readiness, and that `/openapi.json` matches the routes.

**Docker image:** a two-stage `node:22-alpine` build (`npm ci && npm run
build`, then copy `dist` and `node_modules`). `.dockerignore` excludes
`node_modules`, `dist` and `.env`. `dist/` isn't tracked in git.

---

## 4. Dashboard (`dashboard/`)

Next.js 16.3 / React 19.2 / Tailwind 4, linted with `eslint-config-next`.
The developer portal UI on top of the backend API in §3.2.

**Backend-for-frontend.** The browser only talks to the Next.js server.
Server Components and Server Actions call the backend with `lib/backend.ts`
(`BACKEND_URL`, default `http://localhost:4000`), so the backend needs no
CORS and tokens never reach client JavaScript.

**Image.** A two-stage build: `next build` with `output: "standalone"`, then
`node server.js` as the `node` user. Examples and the user guide take their
public addresses from `lib/urls.ts` (`PUBLIC_GATEWAY_URL`, `PUBLIC_PORTAL_URL`,
`PUBLIC_API_URL`, read at runtime; local defaults), and drop `-k` and
`verify=False` when the address isn't localhost.

**Sessions.** One httpOnly, `SameSite=Lax` cookie (`Secure` when the request
came over HTTPS, per `X-Forwarded-Proto`, or with `SESSION_COOKIE_SECURE=true`),
`opengate_session`, holding the OpenGate JWT from `/auth/login` for
`expiresIn` (15 min). There's no WSO2 token in the dashboard; the backend
has its own. A second, readable cookie, `opengate_theme` (`light`, `dark` or
`system`; light if missing), is read by the root layout to set
`<html data-theme>`, so the server renders the chosen theme with no flash.
`app/ui/theme-switcher.tsx` sets both the attribute and the cookie.

**UI.** A warm paper-and-ink look with hairline rules and one accent colour.
Theme tokens (light by default, dark, and "system" via `prefers-color-scheme`)
and the component classes (`display` serif headings, `eyebrow` mono labels,
`card`, `button-*`, `badge*`, `icon-tile`, `method-*`, `code-block`,
`prose-docs`) live in `app/globals.css`. Fonts are Instrument Sans, Instrument
Serif and JetBrains Mono via `next/font`; icons come from `lucide-react`.
Shared pieces are in `app/ui/` (page header, empty state, logo, API icon,
site header, theme switcher). `lib/categories.ts` maps WSO2 tags to an icon; `lib/apis.ts` loads the catalog (the list plus each API's
details, since WSO2's list leaves tags out).

`proxy.ts` redirects requests without a session cookie to
`/login?next=<path>` (an optimistic check only). `requireUser()` in
`lib/session.ts` verifies the token with `/auth/me`, is cached per request,
and sends a `401` to `/login?expired=1`. Every Server Action calls it again
before doing anything.

| Route | What it does |
|-------|--------------|
| `/` | Public landing page: hero, the live list of API categories, features, steps |
| `/docs` | Public user guide with a sticky table of contents; its troubleshooting table uses error codes observed from the gateway |
| `/login`, `/register` | `(auth)` group: forms backed by `app/actions/auth.ts` |
| `/dashboard` | Overview, where sign-in lands: counts (subscriptions and keys are read per app, in parallel), a getting-started checklist driven by that data, recent applications, one featured API per category |
| `/applications` | The user's applications, newest first, filtered on the server with `?q=` (name, description, policy) |
| `/applications/new` | Create. The throttling policy select is filled from `/throttling-policies/application` and hidden if that can't be loaded. |
| `/applications/[id]` | Details; a Usage section (`?range=24h|7d|30d`: stat tiles, a single-series column chart with hover/focus tooltips and a table view, by-API and by-status tables); OAuth keys and subscriptions (each streamed in its own `Suspense`); delete with confirmation. A backend `404` renders `not-found.tsx`. A new or regenerated secret is held in client state only, so those actions deliberately don't revalidate. Regenerating asks for an inline confirmation first. |
| `/applications/[id]/edit` | Rename, re-describe, or change the throttling policy |
| `/apis` | The API catalog, filtered on the server with `?q=` and `?tag=` (category chips with counts) |
| `/apis/[id]` | API details, a form to subscribe one of your apps on one of its tiers, an **Endpoints** section (one collapsible entry per operation: parameters, body fields, example responses, and a sample `curl` filled with example values against the first gateway URL), and the gateway URLs |
| `/settings` | Profile, appearance (theme) and password |

The signed-in routes share the `(app)` layout (sidebar navigation, theme switch, sign out; a drawer on small screens)
with `loading.tsx` and `error.tsx`. `app/error.tsx` catches failures in that
layout itself, such as the backend being unreachable.

> `dashboard/AGENTS.md` notes that this Next.js version has breaking
> changes. Read `node_modules/next/dist/docs/` before writing dashboard code.

---

## 5. WSO2 API Manager

- Version 4.7.0 (upgraded from 4.4.0; the old setup is in `backups/`).
- The backend only uses the **DevPortal REST API v3**
  (`/api/am/devportal/v3`): `GET /apis`, `GET /apis/{id}`,
  `POST`/`PUT`/`DELETE /applications[/{id}]` (delete is also the create
  rollback), `POST /applications/{id}/generate-keys`,
  `GET /applications/{id}/oauth-keys`,
  `POST /applications/{id}/oauth-keys/{keyMappingId}/regenerate-secret`,
  `POST /applications/{id}/oauth-keys/{keyMappingId}/generate-token`,
  `DELETE /applications/{id}/oauth-keys/{keyMappingId}`,
  `GET /throttling-policies/{application|subscription}`, and `GET`/`POST`/`DELETE` on
  `/subscriptions`. Against the live 4.7.0 compose stack, creating and deleting
  applications, generating, listing and deleting keys, `generate-token`, policies, subscribing
  and listing subscriptions have been run and work; `regenerate-secret` fails inside
  WSO2's key manager. The application `PUT` and unsubscribe haven't been run live yet.
- New applications are created with `tokenType: "JWT"` and the chosen
  `throttlingPolicy` (default `"Unlimited"`).
- **Provider keys.** APIs whose upstream needs a key use WSO2's *API Key*
  endpoint security (`endpointConfig.endpoint_security.{production,sandbox}` with
  `type: "apikey"`, `apiKeyIdentifier`, `apiKeyIdentifierType: HEADER |
  QUERY_PARAMETER`, `apiKeyValue`). The gateway adds the key to each backend
  call; WSO2 stores it encrypted and returns `apiKeyValue: ""` on reads, so every
  `PUT` of such an API must send the key again or it's wiped. A header key
  replaces any value the caller sent; a query key is appended after the
  caller's. The developer's OAuth token isn't forwarded upstream. Verified
  live on 4.7.0 with an echo service and NASA.
- **Response redaction.** Some providers echo the key (NASA puts `api_key=` in
  every link). `scripts/wso2-policies/opengateRedactQueryParams` is a custom
  response policy that reuses WSO2's built-in regex masking mediator
  (`PIIMaskingRegex`, whose own policy is limited to AI APIs) to mask the named
  parameters in URLs and JSON fields. WSO2 4.7.0 has no JavaScript engine for
  script mediators and no built-in "remove query parameter" policy, hence this
  approach.
- **Shared upstream limits.** `x-opengate.upstreamLimit` becomes a WSO2
  *API-level* advanced throttling policy (`OpenGate<n>Per<Unit>`, created
  through the Admin REST API), which counts calls from all applications
  together, unlike subscription tiers. Exceeding it gives `429` with code
  900800. Counting is asynchronous: a 3-per-minute limit let 4 calls through.
- **Container start-up** (`wso2-config/wso2-start.sh`, the compose
  entrypoint, before the image's own): turns on `elk` analytics; makes WSO2
  rebuild its Solr search index when the index is empty but the database
  isn't (listings would otherwise stay empty forever, as the "indexed up to"
  time lives in the database), via a new `[indexing] re_indexing` number kept
  with the index; and pins the `[encryption]` key, which the image otherwise
  regenerates in every new container, breaking every secret encrypted before
  (seen as `CryptoException` for NASA's provider key). The key comes from
  `WSO2_ENCRYPTION_KEY`, else a file on the database volume. Optionally, for a
  server: `WSO2_HOSTNAME` sets `[server] hostname` and `proxyPort = 443` (so
  sign-in redirects use the public name), `WSO2_GATEWAY_HOST` sets the Default
  gateway's `http_endpoint`/`https_endpoint` (and so its vhost), and
  `WSO2_ADMIN_PASSWORD` points `[super_admin]` password at that variable
  (`$env{WSO2_ADMIN_PASSWORD}`), which WSO2 uses for the account on a fresh
  database and for its own internal calls. Each warns if the line it edits is
  missing. Hostname and `proxyPort` follow WSO2 4.7.0's reverse-proxy guide;
  the gateway vhost change hasn't been run against a live server yet. A `wso2am-init`
  busybox service gives the new `solr` volume to WSO2's user, as the image has
  no such directory to copy ownership from.
- The seed script marks key-included APIs with additional properties:
  `providerKey: managed` (displayed, so the DevPortal API and OpenGate's
  `/apis/:id` show it), `upstreamLimit` (displayed, e.g. "900 requests per
  hour, shared by all developers") and `providerKeyFingerprint` (hidden; a
  SHA-256 prefix of the key settings, used to detect rotation).
- `wso2-config/apis` and `wso2-config/sequences` are set aside for API
  definitions and mediation sequences, but they're empty and not mounted
  into the container yet.

---

## 6. Known gaps and next steps

| Area | Gap | Suggested direction |
|------|-----|---------------------|
| Provider keys | One provider key per API, shared by every developer. A shared limit protects the provider's quota, but one developer can still take all of it. Query-parameter keys are appended after a caller's own. | Fair-share limits per application; prefer header keys. |
| WSO2 credentials | The backend acts as one WSO2 account (default `admin`, via the password grant), so all apps share it and names are unique across users. | Use a dedicated least-privilege WSO2 user. Consider per-user WSO2 subscribers if apps must be separated in WSO2 itself. |
| Application lifecycle | Keys use the client-credentials grant only; no API keys. Regenerating a secret fails on WSO2 4.7.0; deleting the keys and generating new ones is the workaround, but it revokes existing tokens with no overlap. The automated tests use a fake WSO2. | Find why WSO2 4.7.0's key manager rejects the secret update. Configurable grant types. Automate an end-to-end test against the compose stack. |
| Sessions | Access tokens only (15 minutes). No refresh tokens and no way to revoke a token, so changing the password doesn't sign out other sessions. | Refresh token in an httpOnly cookie, rotated on each use. |
| Rate limiting | Kept in memory per instance. The limiter's `429` body is plain text, not the usual `{ message }` JSON. | Move to a shared store (e.g. Redis) once there's more than one backend instance; give the limiter a JSON handler. |
| Hosting | One VPS, WSO2 on embedded H2, backups by hand. WSO2's public-hostname settings are untested live. | Verify on the first deploy; move WSO2 to PostgreSQL; scripted backups. |
| `/apis` | Unauthenticated and sends no WSO2 token, so only public APIs show up. | Decide on visibility, then forward the right credentials. |
| Dashboard | No session refresh, so users are sent to sign in again after 15 minutes. Untested against a live stack in CI. | Follows from the sessions row above. Add Playwright end-to-end tests. |
| SDK | `packages/sdk` not implemented. | Generate it from `/openapi.json` (e.g. `openapi-typescript`), then use it in the dashboard instead of the hand-written types in `lib/types.ts`. |
| Observability | JSON request logs with ids, `/ready`, and per-application usage from the gateway's analytics log. No metrics endpoint for the backend itself, and the request id isn't forwarded to WSO2 or from the dashboard. Usage is read from a file on a shared volume, which assumes one gateway node. | Forward `X-Request-Id` end to end; Prometheus metrics; with several gateway nodes, ship analytics to a collector instead of a shared file. |

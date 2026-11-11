# OpenGate (Unified Dev Gateway): Architecture

OpenGate puts its own developer-facing layer in front of **WSO2 API Manager**.
Developers sign up with OpenGate and create WSO2 applications through the
OpenGate backend. OpenGate records who owns each application, so a user only
ever sees their own.

> Status: the backend is the working core. The dashboard is still the
> Next.js starter template, and `packages/sdk` is an empty placeholder.
> See [Known gaps](#known-gaps--next-steps).

---

## 1. System overview

```
                         ┌──────────────────────────────────────────────┐
                         │          docker network: devgateway          │
                         │                                              │
 Browser ──:3000──────▶  │  dashboard (Next.js 16)                      │
                         │                                              │
 API client ─:4000────▶  │  backend (Express 5 / Node 22) ──────┐       │
                         │      │                               │       │
                         │      │ mongodb://mongo:27017         │ HTTPS │
                         │      ▼                               ▼       │
                         │  mongo (MongoDB 8)       wso2am (WSO2 APIM   │
                         │   users, applications     4.7.0) DevPortal   │
                         │                           REST API v3        │
                         └──────────────────────────────────────────────┘
                                  WSO2 also exposes :9443 (portals/admin),
                                  :8243 / :8280 (API gateway HTTPS / HTTP)
```

| Service     | Image / build          | Port(s)            | Role |
|-------------|------------------------|--------------------|------|
| `wso2am`    | `wso2/wso2am:4.7.0`    | 9443, 8243, 8280   | API Manager: publishes APIs, owns applications, keys, subscriptions, throttling, and the runtime gateway. |
| `mongo`     | `mongo:8`              | internal only      | OpenGate's own data: user accounts and application ownership. |
| `backend`   | `services/backend`     | 4000               | OpenGate API: authentication, ownership, and a typed facade over the WSO2 DevPortal API. |
| `dashboard` | `dashboard`            | 3000               | Developer UI: sign-in, API catalogue, application management. |

**Startup order** (from `docker-compose.yml`): `backend` waits until both
`wso2am` (startup health check) and `mongo` (`ping`) report healthy, and
`dashboard` waits for `wso2am`. WSO2 needs up to about 2 minutes to start
(`start_period: 120s`).

**Persistent volumes:** `mongo-data`, `wso2am-470-deployment` (deployed
artifacts) and `wso2am-470-database` (WSO2's embedded H2 databases).

---

## 2. Repository layout

```
.
├── docker-compose.yml        # Whole stack
├── .env.example              # JWT_SECRET (copy to .env)
├── ARCHITECTURE.md
├── dashboard/                # Next.js 16 app (starter template so far)
├── packages/sdk/             # Placeholder for a client SDK (empty)
├── services/backend/         # OpenGate backend (see §3)
├── wso2-config/              # apis/, sequences/: WSO2 artifacts (empty so far)
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
| `src/app.ts` | `createApp(deps)`: builds the Express app from `AppDependencies` (`users`, `applications`, `passwords`, `tokens`, `wso2`). Has no I/O of its own. |
| `src/config.ts` | Reads and validates environment variables (§3.6). |
| `src/routes/` | `authRouter` (adds rate limiting) and `applicationRouter` (all routes need auth). |
| `src/controllers/` | `AuthController` and `ApplicationController`. Handlers are arrow functions, so they can be passed directly as route handlers. |
| `src/services/` | `AuthService` (register/login/me), `Wso2ApplicationService` (create/list/get/update/delete, OAuth keys, ownership) and `SubscriptionService` (an app's WSO2 subscriptions; uses `Wso2ApplicationService.get` for ownership). |
| `src/repositories/` | `IUserRepository` / `IApplicationRepository` interfaces and their Mongo implementations. Return plain records (`PublicUser`, `ApplicationRecord`), never Mongoose documents. |
| `src/models/` | Mongoose schemas (§3.4). |
| `src/security/` | `PasswordHasher` (argon2), `UserTokenService` (JWT via `jose`), `requireAuth` middleware. |
| `src/integrations/wso2/client.ts` | `Wso2Transport` interface plus the axios-based `Wso2Client` (10s timeout, no redirects, optional self-signed TLS). |
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
| `GET`  | `/apis` | none | Proxies the WSO2 DevPortal `GET /apis` (only publicly visible APIs) |
| `GET`  | `/apis/:id` | none | Proxies `GET /apis/{id}` (details, including subscription `tiers`). The id is URL-encoded. |
| `POST` | `/auth/register` | none, rate-limited | `{ email, password }` → `201 { user }`. Password ≥ 8 chars. Email is trimmed and lowercased. Duplicate → `409`. |
| `POST` | `/auth/login` | none, rate-limited | `{ email, password }` → `{ accessToken, tokenType: "Bearer", expiresIn: 900, user }`. Unknown user and wrong password both give the same `401`. |
| `GET`  | `/auth/me` | OpenGate JWT | `{ user }` |
| `POST` | `/applications` | OpenGate JWT **and** `X-WSO2-Authorization` | `{ name, description? }` → `201 { application }` |
| `GET`  | `/applications` | OpenGate JWT | `{ applications: [...] }`, the caller's apps, newest first |
| `GET`  | `/applications/:id` | OpenGate JWT | `{ application }`. Another user's app or an unknown/malformed id → `404` |
| `PATCH` | `/applications/:id` | OpenGate JWT **and** `X-WSO2-Authorization` | `{ name?, description? }` → `{ application }`. WSO2's update is a full `PUT`, so stored values are merged in and the creation-time policy and token type are re-sent. WSO2 first; a refusal leaves the record unchanged. |
| `DELETE` | `/applications/:id` | OpenGate JWT **and** `X-WSO2-Authorization` | `204`. Deletes in WSO2 first (a WSO2 `404` counts as already gone), then removes the record. Ownership is checked before WSO2 is called. |
| `GET` | `/applications/:id/keys` | OpenGate JWT **and** `X-WSO2-Authorization` | `{ keys: [...] }` from WSO2 `oauth-keys`. Secrets and access tokens are never included. |
| `POST` | `/applications/:id/keys` | OpenGate JWT **and** `X-WSO2-Authorization` | `{ keyType: "PRODUCTION" \| "SANDBOX" }` → `201 { key }` with `consumerKey` **and `consumerSecret`**, the only time the secret is returned. Client-credentials grant, Resident Key Manager. Existing keys → WSO2's `409`. |
| `GET` | `/applications/:id/subscriptions` | OpenGate JWT **and** `X-WSO2-Authorization` | `{ subscriptions: [{ subscriptionId, apiId, apiName, apiVersion, apiContext, throttlingPolicy, status }] }` |
| `POST` | `/applications/:id/subscriptions` | OpenGate JWT **and** `X-WSO2-Authorization` | `{ apiId, throttlingPolicy? = "Unlimited" }` → `201 { subscription }` |
| `DELETE` | `/applications/:id/subscriptions/:subscriptionId` | OpenGate JWT **and** `X-WSO2-Authorization` | `204`. First reads the subscription from WSO2 and returns `404` unless it belongs to this app. |

`application` shape:

```json
{
  "id": "6ae985a7348dc636274f99de",
  "ownerId": "6ae985a7348dc636274f99dc",
  "wso2ApplicationId": "f3c1…",
  "name": "my-app",
  "description": "",
  "createdAt": "2026-11-03T06:56:39.898Z"
}
```

**Two tokens.** `Authorization: Bearer <OpenGate JWT>` identifies the
OpenGate user. `X-WSO2-Authorization: Bearer <WSO2 token>` is forwarded
unchanged to WSO2 when the call has to act inside WSO2: creating,
updating and deleting applications, and everything under `keys` and
`subscriptions`. Application reads (`GET /applications[/:id]`) are served
from Mongo and don't need it.

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
                                                  │ validates X-WSO2-Authorization, name
                                                  ▼
                               Wso2ApplicationService.create(ownerId, input, wso2Token)
                                  1. WSO2  POST /applications
                                     {name, description, throttlingPolicy:"Unlimited", tokenType:"JWT"}
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
                                       createdAt / updatedAt
```

The repositories turn malformed ObjectId strings into `null` ("not
found") rather than letting Mongoose throw a `CastError`, which would
otherwise come back as a 500.

### 3.5 Security model

| Concern | Implementation |
|---------|----------------|
| Password storage | argon2 (library defaults, argon2id) |
| Session tokens | HS256 JWT via `jose`: `iss=opengate`, `aud=opengate-backend`, `sub=<userId>`, 15-minute expiry. Verification pins the algorithm and requires `sub`, `iat` and `exp`. `JWT_SECRET` must be at least 32 bytes or startup fails. |
| Brute force | `express-rate-limit` on `/auth/register` and `/auth/login`: 20 requests per 15 minutes per IP (in memory, per instance) |
| User enumeration | Login gives the same 401 for an unknown email and a wrong password. Another user's application gives 404, not 403. |
| Input handling | JSON body limit 100 kB. Credentials must be strings. Malformed JSON → 400. |
| Tenant isolation | Every application query is scoped by `ownerId` from the verified JWT. |
| Error leakage | Unexpected errors → generic 500, and full details are logged on the server only. `x-powered-by` is disabled. |
| TLS to WSO2 | Certificates are verified unless `WSO2_ALLOW_SELF_SIGNED=true`. Compose sets it because WSO2 ships with a self-signed certificate. |

### 3.6 Configuration

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `MONGO_URI` | yes | none | Compose: `mongodb://mongo:27017/opengate` |
| `JWT_SECRET` | yes | none | ≥ 32 bytes. Compose reads it from the root `.env` (`openssl rand -base64 48`). |
| `WSO2_BASE_URL` | no | `https://localhost:9443/api/am/devportal/v3` | Compose: `https://wso2am:9443/...` |
| `WSO2_ALLOW_SELF_SIGNED` | no | `false` | `"true"` to accept WSO2's default certificate |
| `PORT` | no | `4000` | |

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
5. Anything else → `500 "Internal server error"` (logged)

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
The suite covers auth, validation, token checks, WSO2 pass-through and
outages, rollback, ownership isolation and ordering.

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

**Sessions.** Two httpOnly, `SameSite=Lax` cookies (`Secure` in production):

| Cookie | Holds | Lifetime |
|--------|-------|----------|
| `opengate_session` | OpenGate JWT from `/auth/login` | `expiresIn` (15 min) |
| `opengate_wso2_token` | WSO2 token pasted on `/settings` | 1 hour |

`proxy.ts` redirects requests without a session cookie to
`/login?next=<path>` (an optimistic check only). `requireUser()` in
`lib/session.ts` verifies the token with `/auth/me`, is cached per request,
and sends a `401` to `/login?expired=1`. Every Server Action calls it again
before doing anything.

| Route | What it does |
|-------|--------------|
| `/` | Public landing page |
| `/login`, `/register` | `(auth)` group: forms backed by `app/actions/auth.ts` |
| `/applications` | The user's applications, newest first |
| `/applications/new` | Create (needs the WSO2 cookie) |
| `/applications/[id]` | Details; OAuth keys and subscriptions (each streamed in its own `Suspense`); delete with confirmation. A backend `404` renders `not-found.tsx`. A new secret is held in client state only, so the generate action deliberately doesn't revalidate. |
| `/applications/[id]/edit` | Rename or re-describe |
| `/apis` | Public WSO2 APIs, filtered on the server with `?q=` |
| `/apis/[id]` | API details, gateway endpoints, and a form to subscribe one of your apps on one of its tiers |
| `/settings` | Save or clear the WSO2 token |

The signed-in routes share the `(app)` layout (header, navigation, sign out)
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
  `GET /applications/{id}/oauth-keys`, and `GET`/`POST`/`DELETE` on
  `/subscriptions`. The keys and subscription calls follow the v3 spec but
  haven't yet been run against a live 4.7.0 instance.
- New applications are created with `throttlingPolicy: "Unlimited"` and
  `tokenType: "JWT"`.
- `wso2-config/apis` and `wso2-config/sequences` are set aside for API
  definitions and mediation sequences, but they're empty and not mounted
  into the container yet.

---

## 6. Known gaps and next steps

| Area | Gap | Suggested direction |
|------|-----|---------------------|
| WSO2 credentials | Clients have to supply their own WSO2 token (`X-WSO2-Authorization`). | Have the backend get its own token: register an OAuth client with WSO2 (DCR) and use a service account. Then users only ever deal with OpenGate tokens. |
| Application lifecycle | Keys use the client-credentials grant only; no key regeneration, secret rotation, or API keys. The throttling policy is fixed at `Unlimited`. Keys and subscriptions are only tested against a fake WSO2. | Add regenerate/rotate endpoints and configurable grant types. Run an end-to-end test against the compose stack. |
| Sessions | Access tokens only (15 minutes). No refresh tokens and no way to revoke a token. | Refresh token in an httpOnly cookie, rotated on each use. |
| Rate limiting | Kept in memory per instance. | Move to a shared store (e.g. Redis) once there's more than one backend instance. |
| `/apis` | Unauthenticated and sends no WSO2 token, so only public APIs show up. | Decide on visibility, then forward the right credentials. |
| Throttling policy | Hard-coded to `Unlimited`. | Make it configurable per request or per plan. |
| Dashboard | Users paste a WSO2 token by hand; no session refresh, so users are sent to sign in again after 15 minutes. Untested against a live stack in CI. | Follows from the WSO2 credentials and sessions rows above. Add Playwright end-to-end tests. |
| SDK | `packages/sdk` not implemented. | Generate it from an OpenAPI spec for the backend. |
| Observability | `console` logging only. | Structured logging (e.g. pino) with request IDs. Readiness check that covers Mongo and WSO2. |
| Docs | Root `README.md` is empty. | Add a quick-start: `.env`, `docker compose up`, a first API call. |

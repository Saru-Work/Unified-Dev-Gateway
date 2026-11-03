# OpenGate: Unified Dev Gateway

OpenGate is a developer gateway that sits in front of **WSO2 API Manager**.
Developers create an OpenGate account, browse the published APIs, and create
WSO2 applications. OpenGate keeps track of who owns each application, so
every developer sees only their own.

```
 you ──▶ OpenGate backend (:4000) ──▶ WSO2 API Manager (:9443)
               │
               └──▶ MongoDB (accounts + application ownership)
```

This guide covers running the stack and using it end to end. For the
internals (layers, data model, security, error handling), see
[ARCHITECTURE.md](ARCHITECTURE.md).

> **Status:** the backend API is working and tested. The dashboard on `:3000`
> is still the Next.js starter page, so for now you use OpenGate through its
> HTTP API (examples below use `curl`).

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Start the stack](#2-start-the-stack)
3. [The end-to-end flow](#3-the-end-to-end-flow)
4. [Walkthrough](#4-walkthrough)
5. [API reference](#5-api-reference)
6. [Errors](#6-errors)
7. [Local development (without Docker)](#7-local-development-without-docker)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Tool | Needed for |
|------|-----------|
| Docker + Docker Compose v2 (`docker compose`) | Running the full stack |
| `curl` and `jq` (optional) | The examples in this guide |
| Node.js 22+ and MongoDB | Only for [local development](#7-local-development-without-docker) |

WSO2 API Manager needs about **4 GB of RAM** available to Docker.

---

## 2. Start the stack

```bash
# 1. Create your .env from the template and set a JWT secret (32+ bytes)
cp .env.example .env
echo "JWT_SECRET=$(openssl rand -base64 48)" > .env

# 2. Build and start everything
docker compose up --build -d

# 3. Wait until WSO2 is healthy (first start takes about 2 minutes)
docker compose ps          # wso2am / mongo should show "(healthy)"
docker compose logs -f backend
#   → "Connected to MongoDB"
#   → "OpenGate backend is running on port 4000"
```

Compose refuses to start if `JWT_SECRET` is missing, and the backend exits if
it's shorter than 32 bytes.

| Service | URL | Notes |
|---------|-----|-------|
| OpenGate backend | http://localhost:4000 | The API used in this guide |
| Dashboard | http://localhost:3000 | Placeholder UI for now |
| WSO2 Publisher | https://localhost:9443/publisher | Publish APIs (login `admin` / `admin`) |
| WSO2 Developer Portal | https://localhost:9443/devportal | WSO2's own portal |
| WSO2 API gateway | https://localhost:8243, http://localhost:8280 | Where published APIs are invoked |
| MongoDB | (internal only) | Not exposed to the host |

Check that it's up:

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

Stop it with `docker compose down`. Add `-v` to also delete the Mongo and
WSO2 data volumes.

---

## 3. The end-to-end flow

```
 ┌──────────────┐
 │ 0. Publish   │  An API owner publishes APIs in the WSO2 Publisher
 │    an API    │  (one-time, done in WSO2, not in OpenGate)
 └──────┬───────┘
        ▼
 ┌──────────────┐  POST /auth/register
 │ 1. Sign up   │  OpenGate account (email + password, stored with argon2)
 └──────┬───────┘
        ▼
 ┌──────────────┐  POST /auth/login
 │ 2. Log in    │  → OpenGate access token (JWT, valid 15 minutes)
 └──────┬───────┘
        ▼
 ┌──────────────┐  GET /apis
 │ 3. Browse    │  The APIs published in WSO2
 └──────┬───────┘
        ▼
 ┌──────────────┐  Get a token from WSO2 itself (see §4.4); OpenGate
 │ 4. WSO2 token│  forwards it to WSO2 when creating applications
 └──────┬───────┘
        ▼
 ┌──────────────┐  POST /applications
 │ 5. Create an │  OpenGate creates the app in WSO2, then records you
 │  application │  as its owner in MongoDB
 └──────┬───────┘
        ▼
 ┌──────────────┐  GET /applications, GET /applications/:id
 │ 6. Manage    │  Lists only your own apps; no WSO2 token needed
 └──────────────┘
```

### Two tokens

Every call that changes something in WSO2 carries **two** tokens:

| Header | Token | Proves |
|--------|-------|--------|
| `Authorization: Bearer …` | OpenGate access token from `/auth/login` | *Who you are in OpenGate* (used for ownership) |
| `X-WSO2-Authorization: Bearer …` | WSO2 OAuth token | *That WSO2 allows the action* (forwarded unchanged to WSO2) |

Only `POST /applications` needs the WSO2 token today. Reads come from
OpenGate's own database. (Having the backend get WSO2 tokens itself, so
users only ever handle the OpenGate token, is on the roadmap. See
[ARCHITECTURE.md §6](ARCHITECTURE.md#6-known-gaps--next-steps).)

### What happens inside `POST /applications`

1. OpenGate checks your OpenGate token, the WSO2 token header, and the `name`.
2. It calls WSO2 `POST /applications` with `throttlingPolicy: "Unlimited"`
   and `tokenType: "JWT"`.
3. If WSO2 rejects the request, its status code is returned to you unchanged
   (e.g. `409` if the name is taken). If WSO2 can't be reached, you get `502`.
4. If WSO2 accepts, OpenGate saves `{ owner: you, wso2ApplicationId, name, … }`
   in MongoDB.
5. If that save fails, OpenGate **deletes the app from WSO2 again**, so no app
   is left without an owner.

---

## 4. Walkthrough

The commands below are written for bash or zsh. They store tokens and IDs in
shell variables so later steps can reuse them.

```bash
API=http://localhost:4000
```

### 4.1 Sign up

```bash
curl -s $API/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"Dev@Example.com","password":"password123"}'
```

```json
{"user":{"id":"6ae9843c0c47b0497ac38be5","email":"dev@example.com"}}
```

- Status `201`. Emails are trimmed and lowercased.
- Passwords need at least **8 characters**.
- Registering the same email again returns `409`.

### 4.2 Log in

```bash
TOKEN=$(curl -s $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"password123"}' | jq -r .accessToken)
```

Full response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": { "id": "6ae9843c0c47b0497ac38be5", "email": "dev@example.com" }
}
```

The token lasts **15 minutes** (`expiresIn` is in seconds). When it expires,
log in again; there are no refresh tokens yet. Check who you are:

```bash
curl -s $API/auth/me -H "Authorization: Bearer $TOKEN"
# {"user":{"id":"6ae9843c0c47b0497ac38be5","email":"dev@example.com"}}
```

> `/auth/register` and `/auth/login` allow **20 requests per 15 minutes per
> IP**. After that they return `429`.

### 4.3 Browse APIs

```bash
curl -s $API/apis | jq
```

This returns WSO2's API list unchanged. It only shows APIs that have been
**published** and are publicly visible. If the list is empty, publish one in the
[WSO2 Publisher](https://localhost:9443/publisher) first.

### 4.4 Get a WSO2 token

> These steps follow WSO2 API Manager 4.x's REST API docs. They haven't been
> run against this stack yet, so check them against your WSO2 version.

First, register an OAuth client with WSO2 (one-time). This uses the WSO2
admin login (`admin` / `admin` by default):

```bash
CLIENT=$(curl -sk -u admin:admin \
  -H 'Content-Type: application/json' \
  https://localhost:9443/client-registration/v0.17/register \
  -d '{
        "callbackUrl": "www.example.com",
        "clientName": "opengate_devportal",
        "owner": "admin",
        "grantType": "client_credentials password refresh_token",
        "saasApp": true
      }')
CLIENT_ID=$(echo "$CLIENT" | jq -r .clientId)
CLIENT_SECRET=$(echo "$CLIENT" | jq -r .clientSecret)
```

Then request a token that has the Developer Portal application scopes:

```bash
WSO2_TOKEN=$(curl -sk -u "$CLIENT_ID:$CLIENT_SECRET" \
  https://localhost:9443/oauth2/token \
  -d 'grant_type=password&username=admin&password=admin&scope=apim:subscribe apim:app_manage' \
  | jq -r .access_token)
```

### 4.5 Create an application

```bash
curl -s $API/applications \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-WSO2-Authorization: Bearer $WSO2_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"weather-app","description":"My first app"}'
```

```json
{
  "application": {
    "id": "6ae985a7348dc636274f99de",
    "ownerId": "6ae9843c0c47b0497ac38be5",
    "wso2ApplicationId": "a9f3c1e2-…",
    "name": "weather-app",
    "description": "My first app",
    "createdAt": "2026-11-03T06:56:39.898Z"
  }
}
```

- Status `201`.
- `id` is OpenGate's ID, which you use with the OpenGate API.
- `wso2ApplicationId` is the same app's ID in WSO2 (e.g. in the WSO2 Developer Portal).

### 4.6 List and view your applications

```bash
# All of your apps, newest first
curl -s $API/applications -H "Authorization: Bearer $TOKEN"

# One app
curl -s $API/applications/6ae985a7348dc636274f99de -H "Authorization: Bearer $TOKEN"
```

Another user's app returns `404` (not `403`), the same as an ID that doesn't
exist. That way, the API never confirms that someone else's app exists.

---

## 5. API reference

Base URL: `http://localhost:4000`. Request and response bodies are JSON.

| Method | Path | Headers | Body | Success |
|--------|------|---------|------|---------|
| `GET` | `/health` | none | none | `200 {status}` |
| `GET` | `/apis` | none | none | `200` WSO2 API list |
| `POST` | `/auth/register` | none | `{email, password}` | `201 {user}` |
| `POST` | `/auth/login` | none | `{email, password}` | `200 {accessToken, tokenType, expiresIn, user}` |
| `GET` | `/auth/me` | `Authorization` | none | `200 {user}` |
| `POST` | `/applications` | `Authorization`, `X-WSO2-Authorization` | `{name, description?}` | `201 {application}` |
| `GET` | `/applications` | `Authorization` | none | `200 {applications}` |
| `GET` | `/applications/:id` | `Authorization` | none | `200 {application}` |

---

## 6. Errors

Every error response has the same shape:

```json
{ "message": "Human-readable reason", "details": { "...": "only for WSO2 errors" } }
```

| Status | When |
|--------|------|
| `400` | Missing or invalid fields, password under 8 characters, malformed JSON |
| `401` | Missing, invalid or expired OpenGate token. Wrong email or password. Missing `X-WSO2-Authorization` on `POST /applications`. |
| `404` | Application not found, or it belongs to someone else |
| `409` | Email already registered |
| `413` | Request body over 100 kB |
| `429` | Too many register/login attempts (wait 15 minutes) |
| WSO2's status | WSO2 rejected the call (e.g. `401` bad WSO2 token, `409` duplicate app name). WSO2's response body is in `details`. |
| `502` | WSO2 unreachable or timed out (10s), or WSO2 returned no application ID |
| `500` | Unexpected server error (details are logged by the backend, not returned) |

---

## 7. Local development (without Docker)

Run the backend directly. You'll need MongoDB running locally, plus WSO2 if
you want `/apis` and application creation to work.

```bash
cd services/backend
npm ci

export MONGO_URI=mongodb://127.0.0.1:27017/opengate
export JWT_SECRET="$(openssl rand -base64 48)"
export WSO2_BASE_URL=https://localhost:9443/api/am/devportal/v3
export WSO2_ALLOW_SELF_SIGNED=true   # WSO2 ships with a self-signed certificate

npm run dev      # tsx watch on src/index.ts, port 4000 (override with PORT)
```

To run only WSO2 and Mongo in Docker, use `docker compose up -d wso2am mongo`.
Note that compose doesn't publish Mongo's port, so to reach it from the host
add `ports: ["27017:27017"]` under `mongo`.

| Command (in `services/backend`) | What it does |
|---------------------------------|--------------|
| `npm run dev` | Start with auto-reload |
| `npm test` | Run the test suite. No Mongo or WSO2 needed (uses in-memory fakes). |
| `npm run lint` | Strict type check of `src/` and `test/` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |

### Environment variables

| Variable | Required | Default |
|----------|----------|---------|
| `MONGO_URI` | yes | none |
| `JWT_SECRET` | yes (32+ bytes) | none |
| `WSO2_BASE_URL` | no | `https://localhost:9443/api/am/devportal/v3` |
| `WSO2_ALLOW_SELF_SIGNED` | no | `false` |
| `PORT` | no | `4000` |

---

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| `docker compose up` says *Set JWT_SECRET (32+ bytes) in .env* | Create `.env` at the repo root (see [§2](#2-start-the-stack)). |
| Backend exits with *JWT_SECRET must contain at least 32 bytes* | The secret is too short. Regenerate it with `openssl rand -base64 48`. |
| Backend exits with *Missing required environment variable* | Set the variable it names (local dev: see [§7](#7-local-development-without-docker)). |
| Backend container stays in `Created` / waiting | WSO2 is still starting; its health check allows about 2 minutes. Watch `docker compose logs -f wso2am`. |
| Every call returns `502 WSO2 is unreachable` | WSO2 isn't up or `WSO2_BASE_URL` is wrong. Inside compose the host is `wso2am`, not `localhost`. |
| WSO2 calls fail with certificate errors | Set `WSO2_ALLOW_SELF_SIGNED=true` (compose already does). |
| `401 Invalid or expired token` after a while | OpenGate tokens last 15 minutes. Log in again. |
| `POST /applications` returns WSO2's `401` or `403` | The WSO2 token has expired or lacks the `apim:subscribe apim:app_manage` scopes. Get a new one ([§4.4](#44-get-a-wso2-token)). |
| `/apis` returns an empty list | No APIs are published (or none are public) in WSO2 yet. |
| Dashboard on `:3000` doesn't show OpenGate data | Expected: the dashboard isn't built yet. |

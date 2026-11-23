# OpenGate: Unified Dev Gateway

OpenGate is an **API marketplace** built on **WSO2 API Manager**. Developers
sign up once, browse a documented catalog of APIs, and call any of them with
one set of credentials, instead of signing up with every provider. For APIs
whose provider needs a key, OpenGate holds the key and the gateway adds it to
each call, so developers never handle it.

WSO2 does the heavy lifting (security, subscriptions, rate limits, the
gateway). OpenGate is the front door: accounts, the catalog and its docs,
self-service applications, keys and tokens, and per-application usage. It
does all the WSO2 work with its own service account and records who owns each
application, so every developer sees only their own and never needs a WSO2
login.

```
 Browser ──▶ dashboard (:3000) ──▶ backend (:4000) ──▶ WSO2 DevPortal API (:9443)
                                       │    ▲
                                       │    └── gateway usage log (read-only)
                                       └──▶ MongoDB (accounts, ownership, usage)

 Your app ──(access token)──▶ WSO2 gateway (:8243) ──(+ provider key)──▶ upstream API
```

This guide covers running the stack and using it end to end. For the
internals (layers, data model, security, error handling), see
[ARCHITECTURE.md](ARCHITECTURE.md); for a non-technical overview, see
[whatisopengate.txt](whatisopengate.txt).

> **Status:** the backend API and the dashboard work end to end with WSO2
> 4.7.0 (the backend's tests use a fake WSO2; [ARCHITECTURE.md §5](ARCHITECTURE.md#5-wso2-api-manager)
> lists what has been run live). The dashboard on `:3000` covers sign-up and
> sign-in, the API catalog with per-endpoint docs, applications, subscriptions,
> keys and access tokens, usage charts, and a user guide at `/docs`. This
> guide uses the HTTP API (`curl`) so every step is visible; the same flow
> works in the dashboard (see [§4.8](#48-using-the-dashboard)).

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
9. [Deploying to a VPS](#9-deploying-to-a-vps)

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
| Dashboard | http://localhost:3000 | Developer UI on top of the backend |
| WSO2 Publisher | https://localhost:9443/publisher | Publish APIs (login `admin` / `admin`) |
| WSO2 Developer Portal | https://localhost:9443/devportal | WSO2's own portal |
| WSO2 API gateway | https://localhost:8243, http://localhost:8280 | Where published APIs are invoked |
| MongoDB | (internal only) | Not exposed to the host |

Check that it's up:

```bash
curl http://localhost:4000/health
# {"status":"ok"}

# Also checks that MongoDB and WSO2 are reachable (503 if not)
curl http://localhost:4000/ready
# {"status":"ready","checks":{"mongo":"ok","wso2":"ok"}}
```

The full API is described in OpenAPI 3.1 at
http://localhost:4000/openapi.json, ready for Swagger UI, Postman or a
client generator.

Stop it with `docker compose down`. Add `-v` to also delete the Mongo and
WSO2 data volumes.

### Sample APIs

A fresh WSO2 has only its PizzaShack sample. To add 19 public APIs, run:

```bash
scripts/seed-public-apis.sh   # needs curl and jq; safe to re-run
```

| API | Gateway path | Try |
|-----|--------------|-----|
| JSONPlaceholder | `/jsonplaceholder/1.0.0` | `/posts/1`, `/users`, `/todos?userId=1` |
| OpenMeteo (weather) | `/weather/1.0.0` | `/forecast?latitude=51.5&longitude=-0.12&current_weather=true` |
| SunriseSunset | `/sun/1.0.0` | `/json?lat=51.5&lng=-0.12` |
| PublicHolidays | `/holidays/1.0.0` | `/PublicHolidays/2026/GB`, `/NextPublicHolidays/US` |
| Frankfurter (currency) | `/currency/1.0.0` | `/latest?base=USD&symbols=EUR,GBP` |
| PostalCodes | `/postcodes/1.0.0` | `/us/90210` |
| Universities | `/universities/1.0.0` | `/search?country=Japan&limit=3` |
| Dictionary | `/dictionary/1.0.0` | `/entries/en/gateway` |
| ArtInstitute | `/art/1.0.0` | `/artworks/search?q=cats&limit=3` |
| TVMaze | `/tv/1.0.0` | `/search/shows?q=the office`, `/shows/526/cast` |
| RickAndMorty | `/rickandmorty/1.0.0` | `/character?name=rick` |
| PokeAPI | `/pokemon/1.0.0` | `/pokemon/pikachu` |
| TheMealDB | `/meals/1.0.0` | `/search.php?s=arrabiata` |
| RandomUser | `/randomuser/1.0.0` | `/?results=2&nat=gb` |
| CatFacts | `/catfacts/1.0.0` | `/fact` |
| DogCEO | `/dogs/1.0.0` | `/breeds/image/random`, `/breed/hound/list` |
| ChuckNorris | `/chucknorris/1.0.0` | `/jokes/random` |
| Agify | `/agify/1.0.0` | `/?name=alex` |
| NasaAsteroids (key included) | `/nasa/neo/1.0.0` | `/neo/browse?size=2`, `/feed?start_date=2026-11-20` |

Each is published with the Bronze, Silver, Gold and Unlimited tiers. The
gateway takes about 15 seconds to load new APIs, and answers `404` until
then. Calls still need a subscribed app's access token ([§4.9](#49-call-a-subscribed-api)).
The script uses `WSO2_URL`, `WSO2_USERNAME` and `WSO2_PASSWORD` (default
`https://localhost:9443`, `admin`, `admin`). Some upstream APIs have their own
limits (Agify: 100 names a day; TVMaze: 20 calls per 10 seconds) and terms
(SunriseSunset asks to be credited; TheMealDB's built-in key is for
development); see each API's description.

#### Adding or changing an API

Each API is an OpenAPI 3 file in `scripts/public-apis/`: summaries, parameters,
request bodies and example responses. That's what the **Endpoints** section of
an API's page in the dashboard shows. The file's `x-opengate` block sets the
gateway context, the real backend URL and the tags.

1. Add or edit a file. Give path and required parameters an `example`. For an
   optional parameter with no example and no real default, add an
   `x-test-value`: it's used for testing only and never shown in the docs.
2. Check it against the real API and record real example responses:

   ```bash
   node scripts/record-examples.mjs scripts/public-apis/books.json   # or no args for all
   ```

   It calls every GET endpoint with its examples, saves the actual response
   (trimmed) as the example, tries each optional parameter once, and exits 1
   if anything doesn't answer 2xx. Other methods are left as written, since
   calling them could change data.
3. Run `scripts/seed-public-apis.sh` to upload it. Changing only the docs
   re-uploads the definition; adding or removing an endpoint also redeploys the
   API to the gateway.

#### APIs that need a provider key

Most valuable APIs need a key from their provider. OpenGate holds that key and
the gateway adds it to every call, so developers only ever use their OpenGate
token. Add a `providerKey` block to the file's `x-opengate`:

```json
"providerKey": {
  "in": "header",
  "name": "X-Api-Key",
  "env": "NASA_API_KEY",
  "fallback": "DEMO_KEY",
  "redact": ["api_key"]
}
```

| Field | Meaning |
|-------|---------|
| `in` | `header` or `query`: where the provider expects the key. Prefer `header`: the gateway's value replaces anything a caller sends, whereas a query key is appended after the caller's own. |
| `name` | The header or query parameter name. |
| `env` | The environment variable holding the key. The scripts also read the repo's `.env` (as data, never executed); real environment variables win. Keys never go in the API file. |
| `fallback` | Optional: a provider's *public* demo key, used when `env` isn't set. |
| `redact` | Optional: query parameter names whose values the gateway masks in responses (`api_key=*****`, and `"api_key":"*****"` in JSON), for providers that echo the key back. NASA does, in every link. |
| `fallbackLimit` | Optional: the shared limit (see below) to use while `fallback` is in use, since demo keys allow far less. |

**Shared limits.** Everyone using a key-included API shares the provider's
quota, so one busy developer could use it up for all. `"upstreamLimit":
{ "requests": 900, "per": "hour" }` in `x-opengate` (`per`: `min`, `hour` or
`day`) caps the calls the gateway sends to the provider from all developers
together. The seed script creates a WSO2 API-level policy named
`OpenGate<n>Per<Unit>` and applies it; past the limit the gateway answers
`429` (code 900800) for everyone until it resets. WSO2 counts asynchronously,
so a call or two can get past the limit (verified: a limit of 3 per minute let
4 through): set it a little below the provider's real quota. NASA's file uses
900 an hour (NASA allows 1,000) and 25 an hour on `DEMO_KEY`.

What the seed script does with it:

- Stores the key in WSO2 as **API Key endpoint security** (encrypted; WSO2
  never returns it, not even to the Publisher API).
- Adds a visible `providerKey: managed` property, which the dashboard shows as
  **Key included**, and a hidden fingerprint of the key settings, so a changed
  key is detected and redeployed: change `.env`, re-run the script, done.
- Installs and attaches the `opengateRedactQueryParams` response policy
  (`scripts/wso2-policies/`) when `redact` is set.

`record-examples.mjs` calls the provider with the key, masks it in recorded
examples, and fails if a response contains the key and `redact` doesn't cover it.

Everyone using a key-included API shares the provider's quota. NASA's
`DEMO_KEY` allows only about 30 calls an hour per IP, so it's for trying things
out; get a free key at https://api.nasa.gov and set `NASA_API_KEY` in `.env`.
Check each provider's terms allow access through a gateway like this.

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
 ┌──────────────┐  POST /applications
 │ 4. Create an │  OpenGate creates the app in WSO2 with its own
 │  application │  WSO2 token, then records you as its owner in MongoDB
 └──────┬───────┘
        ▼
 ┌──────────────┐  POST /applications/:id/subscriptions, /keys, …/token
 │ 5. Subscribe │  Subscribe the app to APIs, generate keys, get an
 │   and get a  │  access token (only your own apps are visible to you)
 │    token     │
 └──────┬───────┘
        ▼
 ┌──────────────┐  https://<gateway>:8243/<context>/<version>/…
 │ 6. Call APIs │  WSO2's gateway checks the token and the subscription,
 │              │  adds any provider key, and logs the call for usage
 └──────────────┘
```

### One token

Users only ever send their **OpenGate** token (`Authorization: Bearer …` from
`/auth/login`). It says who you are, and OpenGate uses it to check that you own
the application you're acting on.

To act in WSO2, the backend uses **its own** WSO2 token for a service account
(see [§4.4](#44-how-opengate-talks-to-wso2)). An `X-WSO2-Authorization` header
from a client is ignored.

### What happens inside `POST /applications`

1. OpenGate checks your OpenGate token and the `name`.
2. It calls WSO2 `POST /applications` with the chosen `throttlingPolicy`
   (default `"Unlimited"`) and `tokenType: "JWT"`, using its own WSO2 token.
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

### 4.4 How OpenGate talks to WSO2

There's nothing to do here as a user: the backend gets its own WSO2 token.

On the first call that needs WSO2, the backend:

1. Registers an OAuth client named `opengate_backend` with WSO2 (dynamic client
   registration), signing in as `WSO2_USERNAME` / `WSO2_PASSWORD`. If that
   client already exists, WSO2 returns it. To use a client you registered
   yourself, set `WSO2_CLIENT_ID` and `WSO2_CLIENT_SECRET` instead.
2. Asks WSO2's `/oauth2/token` for a token for that account (password grant)
   with the scopes `apim:subscribe apim:app_manage apim:sub_manage`.

The token is cached and refreshed a minute before it expires. If WSO2 rejects
it anyway (say, WSO2's data was reset), the backend gets a fresh one and
retries the call once. If no token can be had (wrong WSO2 password, WSO2 down),
the call fails with `502 OpenGate couldn't authenticate with WSO2`, and the
backend logs the reason.

All applications are created in WSO2 under this one account. OpenGate's
database records which OpenGate user owns each one, and every call checks that
before touching WSO2. One consequence: application names must be unique across
all OpenGate users, because WSO2 enforces unique names per account.

Compose uses `admin` / `admin`, WSO2's out-of-the-box login. For anything
shared, create a dedicated WSO2 user with the `Internal/subscriber` role, and
set `WSO2_USERNAME` and `WSO2_PASSWORD` in `.env`.

### 4.5 Create an application

```bash
curl -s $API/applications \
  -H "Authorization: Bearer $TOKEN" \
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

### 4.7 Delete an application

```bash
curl -s -X DELETE $API/applications/6ae985a7348dc636274f99de \
  -H "Authorization: Bearer $TOKEN"
```

- Status `204`, with no body.
- OpenGate deletes the app in WSO2 first, then removes its own record.
- If WSO2 says the app is already gone (`404`), the record is still removed.
- If WSO2 refuses (e.g. `403`), nothing is removed and you get WSO2's status.

### 4.8 Using the dashboard

Open http://localhost:3000. The dashboard calls the backend from the Next.js
server, so your browser only ever talks to `:3000` and never sees a token.

A user guide is built in at http://localhost:3000/docs (public, no sign-in
needed): key ideas, a quick start, keys and tokens, calling APIs from curl,
JavaScript, Python and Postman, and troubleshooting with the gateway's real
error codes.

Navigation is a sidebar (a slide-out menu on phones). The look is light by
default; switch to dark, or to follow your device, from the sidebar or
**Settings → Appearance**.

1. **Create an account** (or **Sign in**). You land on **Overview**: your
   numbers (applications, subscriptions, apps with keys, APIs available), a
   getting-started checklist that ticks itself off, your recent applications
   and featured APIs. Your session lasts as long as the OpenGate token, 15
   minutes. After that you're asked to sign in again and then sent back to
   the page you were on.
2. **API catalog** lists the public APIs in WSO2, with an icon and colour per
   category. Search by name, description, context or tag, or filter by
   category. Open one to see its **Endpoints**: each one's
   parameters, request body, example responses, and a ready-to-copy `curl`
   that goes through the gateway.
3. **Settings** is where you **change your password**. There's no WSO2
   token to paste: the backend handles WSO2 itself ([§4.4](#44-how-opengate-talks-to-wso2)).
4. **Applications → New application** creates the app in WSO2 and opens its
   page. Pick a **throttling policy** from WSO2's application policies (or
   keep Unlimited). From the app's page you can **Edit** or delete it, and
   **Generate keys** for production or sandbox. Copy the consumer secret
   straight away: it's shown only once. If it's lost, **Delete keys** and
   generate new ones. That revokes the old secret and every access token made
   from it. (**Regenerate secret** is meant for this too, but fails on WSO2
   4.7.0; see [§8](#8-troubleshooting).) The applications list
   can be searched by name, description or policy.
5. Open an API and use **Subscribe** to let one of your applications call it
   on a chosen tier. The application's page lists its subscriptions and
   lets you unsubscribe.
6. To call a subscribed API, use **Get access token** under the app's keys.
   Right after generating keys it's one click; later, paste the consumer
   secret. Send the token as `Authorization: Bearer <token>` to the API's
   gateway URL (shown on the API's page). Tokens last an hour.

### 4.9 Call a subscribed API

With an application subscribed to an API and keys generated, ask OpenGate for
an access token. `keyMappingId` comes from `GET /applications/:id/keys`, and
the consumer secret is the one shown when the keys were generated (OpenGate
doesn't store it):

```bash
ACCESS=$(curl -s $API/applications/$APP_ID/keys/$KEY_MAPPING_ID/token \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"consumerSecret\":\"$CONSUMER_SECRET\"}" | jq -r .token.accessToken)

curl -sk https://localhost:8243/pizzashack/1.0.0/menu -H "Authorization: Bearer $ACCESS"
```

A wrong secret gives `400`. A gateway `401` (`900901 Invalid Credentials`)
means the token is missing or expired: note that the consumer key or secret
themselves are not tokens. A gateway `403` means the app isn't subscribed to
that API.

### 4.10 See an application's usage

Each application's page has a **Usage** section: calls, error rate, throttled
calls (`429`), p95 and average latency, a chart of calls per hour (24 hours)
or per day (7 or 30 days), and breakdowns by API and by response status. The
same data is at `GET /applications/:id/usage?range=24h|7d|30d`.

How it's collected: `wso2-config/wso2-start.sh` turns on WSO2's `elk`
analytics, so the gateway writes one JSON event per call to
`repository/logs/apim_metrics.log`. That directory is the `wso2am-470-logs`
volume, mounted read-only into the backend, which follows the file
(`USAGE_METRICS_LOG`), ties each event to an application by WSO2's
application id, and stores it in MongoDB for 30 days. Events are unique by
correlation id, so re-reading the log never double-counts, and the read
position survives restarts and log rotation. The caller's IP address isn't
stored.

Calls WSO2 rejects before it knows the application (no token, an invalid
token, or a path the API doesn't have) can't be attributed and aren't
counted. Throttled calls are. Numbers appear a few seconds after a call.

---

## 5. API reference

Base URL: `http://localhost:4000`. Request and response bodies are JSON.

| Method | Path | Headers | Body | Success |
|--------|------|---------|------|---------|
| `GET` | `/health` | none | none | `200 {status}` |
| `GET` | `/ready` | none | none | `200 {status, checks}`, or `503` naming the failed check |
| `GET` | `/openapi.json` | none | none | `200` OpenAPI 3.1 document |
| `GET` | `/apis` | none | none | `200` WSO2 API list |
| `GET` | `/apis/:id` | none | none | `200` WSO2 API details |
| `GET` | `/apis/:id/operations` | none | none | `200 {operations}`: each endpoint's method, path, summary, parameters, request body fields and example responses, from the API's OpenAPI definition |
| `POST` | `/auth/register` | none | `{email, password}` | `201 {user}` |
| `POST` | `/auth/login` | none | `{email, password}` | `200 {accessToken, tokenType, expiresIn, user}` |
| `GET` | `/auth/me` | `Authorization` | none | `200 {user}` |
| `POST` | `/auth/password` | `Authorization` | `{currentPassword, newPassword}` | `204` |
| `GET` | `/throttling-policies/:level` | `Authorization` | none (`level` = `application` \| `subscription`) | `200 {policies}` |
| `POST` | `/applications` | `Authorization` | `{name, description?, throttlingPolicy? = "Unlimited"}` | `201 {application}` |
| `GET` | `/applications` | `Authorization` | none | `200 {applications}` |
| `GET` | `/applications/:id` | `Authorization` | none | `200 {application}` |
| `PATCH` | `/applications/:id` | `Authorization` | `{name?, description?, throttlingPolicy?}` | `200 {application}` |
| `DELETE` | `/applications/:id` | `Authorization` | none | `204` |
| `GET` | `/applications/:id/usage` | `Authorization` | `?range=24h\|7d\|30d` | `200 {enabled, totals, series, apis, statuses, lastCallAt}`, or `{enabled: false}` when usage isn't collected |
| `GET` | `/applications/:id/keys` | `Authorization` | none | `200 {keys}` (no secrets) |
| `POST` | `/applications/:id/keys` | `Authorization` | `{keyType: "PRODUCTION" \| "SANDBOX"}` | `201 {key}` incl. `consumerSecret`, shown once |
| `DELETE` | `/applications/:id/keys/:keyMappingId` | `Authorization` | none | `204`; revokes the secret and its tokens. `404` if the app has no such keys |
| `POST` | `/applications/:id/keys/:keyMappingId/regenerate-secret` | `Authorization` | none | `200 {key: {consumerKey, consumerSecret}}`, old secret revoked. Currently fails on WSO2 4.7.0 (see §8). |
| `POST` | `/applications/:id/keys/:keyMappingId/token` | `Authorization` | `{consumerSecret}` | `200 {token: {accessToken, tokenType, expiresIn, scopes}}`; `400` if WSO2 refuses the secret |
| `GET` | `/applications/:id/subscriptions` | `Authorization` | none | `200 {subscriptions}` |
| `POST` | `/applications/:id/subscriptions` | `Authorization` | `{apiId, throttlingPolicy?}` | `201 {subscription}` |
| `DELETE` | `/applications/:id/subscriptions/:subscriptionId` | `Authorization` | none | `204` |

---

## 6. Errors

Every error response has the same shape:

```json
{ "message": "Human-readable reason", "details": { "...": "only for WSO2 errors" } }
```

Every response also carries an `X-Request-Id` header (yours, if you send a
short plain one, otherwise a new UUID). The backend logs one JSON line per
request under that id, so quote it when reporting a problem.

| Status | When |
|--------|------|
| `400` | Missing or invalid fields, password under 8 characters, malformed JSON |
| `401` | Missing, invalid or expired OpenGate token. Wrong email or password. |
| `403` | Wrong current password on `/auth/password` |
| `404` | Application not found, or it belongs to someone else |
| `409` | Email already registered |
| `413` | Request body over 100 kB |
| `429` | Too many register, login or change-password attempts (wait 15 minutes) |
| WSO2's status | WSO2 rejected the call (e.g. `409` duplicate app name, `403` missing permission for OpenGate's WSO2 account). WSO2's response body is in `details`. |
| `502` | WSO2 unreachable or timed out (10s), WSO2 returned no application ID, or the backend couldn't get its own WSO2 token |
| `500` | Unexpected server error. Details are logged by the backend, not returned; the body's `requestId` finds the log line. |

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
export WSO2_USERNAME=admin WSO2_PASSWORD=admin   # the account OpenGate acts as in WSO2

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
| `WSO2_USERNAME`, `WSO2_PASSWORD` | yes | none (compose: `admin` / `admin`) |
| `WSO2_CLIENT_ID`, `WSO2_CLIENT_SECRET` | no (both or neither) | none: an OAuth client is registered on first use |
| `USAGE_METRICS_LOG` | no | none: usage is off. Compose sets `/wso2-logs/apim_metrics.log` |
| `TRUST_PROXY` | no | none: `X-Forwarded-For` is ignored. Compose sets `1` (the dashboard or nginx), so the login rate limit counts visitors, not the dashboard |
| `PORT` | no | `4000` |

### Dashboard

```bash
cd dashboard
npm ci
export BACKEND_URL=http://localhost:4000   # the default
npm run dev      # http://localhost:3000
```

`npm run lint` runs ESLint and `npm run build` makes a production build
(it also type-checks). The Docker image is a production build (Next's
standalone server), so use `npm run dev` for hot reload.

| Variable | Default | What it's for |
|----------|---------|---------------|
| `BACKEND_URL` | `http://localhost:4000` | Where the dashboard's server reaches the backend |
| `PUBLIC_GATEWAY_URL` | `https://localhost:8243` | Gateway address in examples and the user guide |
| `PUBLIC_PORTAL_URL` | `https://localhost:9443` | WSO2 host in the guide (`/oauth2/token`, `/publisher`) |
| `PUBLIC_API_URL` | `http://localhost:4000` | OpenGate API address in the guide's automation section |

The session cookie is `Secure` whenever the request arrived over HTTPS
(nginx sends `X-Forwarded-Proto: https`), or always with
`SESSION_COOKIE_SECURE=true`.

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
| `502 OpenGate couldn't authenticate with WSO2` | The backend couldn't get its WSO2 token. Check `WSO2_USERNAME` / `WSO2_PASSWORD` and the backend log line *Failed to get a WSO2 token* ([§4.4](#44-how-opengate-talks-to-wso2)). |
| WSO2 calls return `403` | OpenGate's WSO2 account lacks permission. Give it the `Internal/subscriber` role. |
| **Regenerate secret** returns WSO2's `500` (`900967 General Error`) | WSO2 4.7.0's key manager rejects the secret update (its log shows *Error while generating new consumer secret … status code: 400*), even when called directly on WSO2. Until that's sorted, use **Delete keys** and generate new ones. |
| `/apis` and WSO2's own portals list no APIs after recreating the WSO2 container | WSO2's search index was empty while its database still said "indexed". `wso2-config/wso2-start.sh` now detects an empty index and has WSO2 rebuild it (about 30 seconds); the index lives on the `wso2am-470-solr` volume. |
| WSO2 logs *Error while decrypting … for API* | The data was encrypted with a different `[encryption]` key. WSO2's image generates a random key in every new container; `wso2-start.sh` keeps one key on the database volume (or use `WSO2_ENCRYPTION_KEY` in `.env`). Re-run `scripts/seed-public-apis.sh` to re-store provider keys if needed. |
| `/apis` returns an empty list | No APIs are published (or none are public) in WSO2 yet. |
| Dashboard says "Something went wrong" | The dashboard can't reach the backend. Check `docker compose ps` and that `BACKEND_URL` points at it (compose: `http://backend:4000`). |
| Login says *Too many attempts* for everyone at once | The backend is counting every visitor as the dashboard. Check that nginx sets `X-Real-IP` (it's in `deploy/nginx/opengate.conf`) and the backend has `TRUST_PROXY=1` (compose sets it). |
| Publisher sign-in redirects to `localhost` or `:9443` | `WSO2_HOSTNAME` isn't set, or WSO2 wasn't recreated after setting it: `docker compose up -d wso2am`. Look for *OpenGate: warning* lines in `docker compose logs wso2am`. |
| Gateway answers `404` for every API on the server | The APIs are deployed to the `localhost` vhost. Re-run `scripts/seed-public-apis.sh` with `WSO2_GATEWAY_HOST` in `.env` (it redeploys to the new vhost); in the Publisher, deploy to the `gateway.example.com` vhost. |
| `403` on `portal.example.com/carbon` or `/admin` | Your IP isn't in `/etc/nginx/opengate-admin-ips.conf`. Add `allow <your IP>;` and `sudo systemctl reload nginx`. |

---

## 9. Deploying to a VPS

The same compose stack runs on a server, with nginx on the host in front of
it. Docker binds every service to `127.0.0.1`, so nginx is the only way in.

| Public address | Goes to | Who uses it |
|----------------|---------|-------------|
| `https://app.example.com` | dashboard | Developers |
| `https://portal.example.com/publisher` | WSO2 Publisher | Whoever registers APIs |
| `https://gateway.example.com` | WSO2 gateway | Applications calling APIs |
| `https://api.example.com` | OpenGate REST API | Scripts and CI (optional) |

WSO2's other consoles (`/carbon`, `/admin`) answer only to IP addresses you
allow. Its DevPortal, SOAP admin services and client registration are never
public: OpenGate is the developer portal, and an app made in WSO2's own
DevPortal would have no OpenGate owner.

### Server

- Ubuntu 24.04 (or similar), **8 GB RAM**, 2–4 vCPU, 40 GB disk. WSO2 alone
  wants about 4 GB, and the dashboard build needs headroom; add a few GB of
  swap.
- Docker Engine with the compose plugin, nginx, and certbot
  (`sudo apt install nginx certbot python3-certbot-nginx`).
- DNS `A` (and `AAAA`) records for the four names, pointing at the server.
- Firewall: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`.
  (Docker-published ports bypass ufw, which is why compose binds them to
  `127.0.0.1`.)

### 1. Configure

```bash
git clone <your repo> opengate && cd opengate
cp .env.example .env
```

In `.env` set:

```bash
JWT_SECRET=...                    # openssl rand -base64 48
WSO2_ENCRYPTION_KEY=...           # openssl rand -hex 32; keep a copy off the server
WSO2_ADMIN_PASSWORD=...           # WSO2's admin password
WSO2_PASSWORD=...                 # the same value: the backend signs in as admin
WSO2_HOSTNAME=portal.example.com
WSO2_GATEWAY_HOST=gateway.example.com
PUBLIC_GATEWAY_URL=https://gateway.example.com
PUBLIC_PORTAL_URL=https://portal.example.com
PUBLIC_API_URL=https://api.example.com
NASA_API_KEY=...                  # optional; DEMO_KEY allows ~30 calls an hour
```

Set `WSO2_ADMIN_PASSWORD` **before WSO2's first start**: WSO2 creates the
admin account from it on a fresh database. (On an existing database, change
the password in `/carbon` first, then set it here to match.) Losing
`WSO2_ENCRYPTION_KEY` makes every stored provider key unreadable.

### 2. Start the stack

```bash
docker compose up --build -d
docker compose ps        # wait until backend and dashboard are healthy (~3 minutes)
docker compose logs wso2am | grep 'OpenGate: warning'   # should print nothing
```

### 3. nginx and certificates

```bash
sudo cp deploy/nginx/opengate.conf /etc/nginx/sites-available/opengate.conf
sudo sed -i 's/example\.com/yourdomain.com/g' /etc/nginx/sites-available/opengate.conf
echo "allow $(curl -s https://ifconfig.me);" | sudo tee /etc/nginx/opengate-admin-ips.conf

sudo certbot certonly --nginx -d app.yourdomain.com -d portal.yourdomain.com \
  -d gateway.yourdomain.com -d api.yourdomain.com
sudo ln -s /etc/nginx/sites-available/opengate.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Run the `ifconfig.me` line from the machine you'll administer WSO2 from, or
write your IP into the file by hand; one `allow` line per address. An empty
file blocks `/carbon` and `/admin` for everyone. Drop the `api.` server block
to keep the REST API private.

### 4. Add APIs

On the server, seed the sample APIs. They're deployed to the
`WSO2_GATEWAY_HOST` vhost, so the dashboard shows
`https://gateway.yourdomain.com/...` URLs:

```bash
scripts/seed-public-apis.sh
```

To let others register APIs in the Publisher, give each one their own account
rather than `admin`: in `https://portal.yourdomain.com/carbon` (from an allowed
IP) go to **Users and Roles → Add User**, with the `Internal/creator` and
`Internal/publisher` roles. In the Publisher they:

- create the API (an OpenAPI file gives OpenGate its endpoint docs),
- for an upstream that needs a key, set it under **Endpoints → Endpoint
  security → API Key**,
- pick subscription tiers, deploy a revision to the **Default** gateway on the
  `gateway.yourdomain.com` vhost, set visibility to **Public**, and publish.

### 5. Check it

```bash
curl -s https://api.yourdomain.com/ready     # {"status":"ready",...}
curl -sI https://portal.yourdomain.com/devportal/ | head -1   # 404
curl -sI https://portal.yourdomain.com/carbon/ | head -1      # 403 from elsewhere
```

Then sign up at `https://app.yourdomain.com`, create an app, subscribe it to
an API, get a token, and call the API with the `curl` from its page.

### Keep it running

- **Updates:** `git pull && docker compose up --build -d`.
- **Backups:** the `mongo-data` and `wso2am-470-database` volumes, nightly and
  off the server (e.g. `docker run --rm -v opengate_mongo-data:/v -v $PWD:/b
  alpine tar czf /b/mongo-$(date +%F).tgz -C /v .`; the volume prefix is the
  folder name). Keep `.env` safe too.
- **Certificates** renew automatically (certbot's timer); nginx picks them up
  on reload.
- WSO2's embedded H2 database is fine to start with; move WSO2 to PostgreSQL
  or MySQL before real traffic.
- Check each provider's terms allow access through a public gateway like this.

> `WSO2_HOSTNAME` and `proxyPort = 443` follow WSO2 4.7.0's reverse-proxy
> guide, and the nginx headers match its example. Not yet verified on a live
> server: the gateway vhost taken from `WSO2_GATEWAY_HOST`, and whether any
> WSO2 component calls itself through the public hostname (and so through
> nginx's blocked paths). `wso2-config/wso2-start.sh` warns if a setting it
> expects is missing. Try the Publisher sign-in, the Admin portal, and one
> gateway call before inviting anyone.


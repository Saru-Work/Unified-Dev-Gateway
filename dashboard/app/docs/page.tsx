import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/app/copy-button";
import { SiteHeader } from "@/app/ui/site-header";

export const metadata: Metadata = {
  title: "Documentation · OpenGate",
  description: "How to use OpenGate: find APIs, create applications, get access tokens and call APIs through the WSO2 gateway.",
};

const SECTIONS = [
  { id: "introduction", title: "Introduction" },
  { id: "concepts", title: "Key ideas" },
  { id: "quick-start", title: "Quick start" },
  { id: "account", title: "Your account" },
  { id: "catalog", title: "Finding APIs" },
  { id: "applications", title: "Applications" },
  { id: "subscriptions", title: "Subscriptions and tiers" },
  { id: "keys", title: "Keys and access tokens" },
  { id: "provider-keys", title: "Provider keys" },
  { id: "calling-an-api", title: "Calling an API" },
  { id: "automation", title: "Automating with the OpenGate API" },
  { id: "troubleshooting", title: "Troubleshooting" },
  { id: "publishing", title: "Publishing APIs" },
  { id: "faq", title: "FAQ" },
] as const;

const GATEWAY = "https://localhost:8243";

/** A code sample with a copy button. */
function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="eyebrow">{label}</span>}
      <div className="group relative">
        <pre className="code-block whitespace-pre p-4 pr-24 text-[13px]">{children}</pre>
        <div className="absolute right-2 top-2">
          <CopyButton value={children} />
        </div>
      </div>
    </div>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={
        "border-l-2 py-1 pl-4 text-[15px] " +
        (tone === "warn" ? "border-danger text-foreground/90" : "border-accent text-foreground/90")
      }
    >
      {children}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4 border-t border-border pt-10 first:border-t-0 first:pt-0">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader current="docs" />

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-12 sm:px-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <details className="group rounded-lg border border-border bg-card p-4 lg:hidden">
            <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
              On this page
            </summary>
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted hover:text-foreground">{s.title}</a>
                </li>
              ))}
            </ol>
          </details>
          <nav aria-label="On this page" className="hidden flex-col gap-3 lg:flex">
            <span className="eyebrow">On this page</span>
            <ol className="flex flex-col gap-2 border-l border-border text-sm">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px flex gap-2 border-l border-transparent pl-3 text-muted hover:border-foreground hover:text-foreground">
                    <span className="font-mono text-[11px] leading-5 text-border-strong">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="prose-docs min-w-0 max-w-3xl">
          <header className="flex flex-col gap-4 pb-4">
            <span className="eyebrow">Documentation</span>
            <h1 className="display text-5xl sm:text-6xl">How to use OpenGate</h1>
            <p className="text-lg text-muted">
              Everything you need to go from a new account to calling an API: finding APIs,
              creating applications, getting keys and tokens, and what to do when a call fails.
            </p>
          </header>

          <Section id="introduction" title="Introduction">
            <p>
              OpenGate is a developer portal in front of <strong>WSO2 API Manager</strong>. Your
              organisation publishes APIs in WSO2; OpenGate is where developers find them, read
              how they work, and get the credentials to call them.
            </p>
            <p>There are two separate paths, and it helps to keep them apart:</p>
            <ul>
              <li>
                <strong>You use OpenGate</strong> (this site) to manage things: browse APIs,
                create applications, subscribe, and get keys and tokens.
              </li>
              <li>
                <strong>Your code calls the WSO2 gateway</strong> (for example{" "}
                <code>{GATEWAY}</code>) to use the APIs, sending an access token with each
                request. OpenGate isn&apos;t in that path.
              </li>
            </ul>
            <p>
              You never need a WSO2 account. OpenGate talks to WSO2 for you, and every developer
              sees only their own applications.
            </p>
          </Section>

          <Section id="concepts" title="Key ideas">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>API</strong></td>
                  <td>A service published in WSO2, such as a weather or currency API. Each has a <em>context</em> (e.g. <code>/weather</code>) and a version.</td>
                </tr>
                <tr>
                  <td><strong>Application</strong></td>
                  <td>Your project or client. It holds your keys and the list of APIs it may call.</td>
                </tr>
                <tr>
                  <td><strong>Subscription</strong></td>
                  <td>Permission for one application to call one API, on a chosen tier.</td>
                </tr>
                <tr>
                  <td><strong>Tier</strong></td>
                  <td>A rate limit for a subscription, such as Bronze (1,000 requests a minute).</td>
                </tr>
                <tr>
                  <td><strong>Consumer key and secret</strong></td>
                  <td>An application&apos;s credentials, like a username and password for your code. The secret is shown once.</td>
                </tr>
                <tr>
                  <td><strong>Access token</strong></td>
                  <td>A short-lived token (one hour) made from the key and secret. It goes in every API call: <code>Authorization: Bearer &lt;token&gt;</code>.</td>
                </tr>
                <tr>
                  <td><strong>Gateway</strong></td>
                  <td>WSO2&apos;s entry point for API calls. It checks the token, the subscription and the tier, then forwards the call.</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section id="quick-start" title="Quick start">
            <p>From a new account to a working call in about five minutes:</p>
            <ol>
              <li><Link href="/register" className="link">Create an account</Link> with an email and a password.</li>
              <li>
                Go to <strong>Applications → New application</strong>, give it a name, and create
                it.
              </li>
              <li>
                Open the <strong>API catalog</strong>, pick an API (try <em>CatFacts</em>), choose
                your application and a tier under <strong>Subscribe</strong>, and subscribe.
              </li>
              <li>
                On your application&apos;s page, under <strong>OAuth keys → Production</strong>,
                click <strong>Generate keys</strong>. Copy the consumer secret somewhere safe.
              </li>
              <li>Click <strong>Get access token</strong> and copy the token.</li>
              <li>Call the API with it:</li>
            </ol>
            <Code>{`curl -k ${GATEWAY}/catfacts/1.0.0/fact \\
  -H "Authorization: Bearer <access token>"`}</Code>
            <p>
              You should get a JSON cat fact back. The <code>-k</code> flag is only needed
              locally, where WSO2 uses a self-signed certificate.
            </p>
          </Section>

          <Section id="account" title="Your account">
            <ul>
              <li>
                <strong>Signing up</strong> needs an email and a password of at least 8
                characters. You land on <strong>Overview</strong>, which shows your numbers and a
                checklist of next steps.
              </li>
              <li>
                <strong>Sessions</strong> last 15 minutes. After that you&apos;re asked to sign
                in again and taken back to the page you were on.
              </li>
              <li>
                <strong>Password</strong>: change it under <strong>Settings → Password</strong>.
                You&apos;ll need your current one.
              </li>
              <li>
                <strong>Appearance</strong>: light, dark, or follow your device, from the
                sidebar or <strong>Settings</strong>. It&apos;s remembered on this browser.
              </li>
              <li>
                After several wrong attempts at signing in or changing a password, you&apos;ll
                be asked to wait 15 minutes.
              </li>
            </ul>
          </Section>

          <Section id="catalog" title="Finding APIs">
            <p>
              The <strong>API catalog</strong> lists every public API in WSO2. Search by name,
              description, context or tag, or narrow it down by category.
            </p>
            <p>Open an API to see:</p>
            <ul>
              <li>
                <strong>Endpoints</strong>: each operation with its method and path. Expand one
                for its parameters (where they go, their type, whether they&apos;re required,
                allowed values, defaults and examples), its request body, and example responses.
              </li>
              <li>
                <strong>Try it</strong>: a ready-to-paste <code>curl</code> for that endpoint,
                filled in with example values. Replace <code>&lt;access token&gt;</code> and
                run it.
              </li>
              <li>
                <strong>Subscribe</strong>, <strong>Details</strong> (context, tiers, tags) and
                the <strong>Gateway URLs</strong> your code should call.
              </li>
              <li><strong>Provider docs</strong>, when the API links to its own documentation.</li>
            </ul>
          </Section>

          <Section id="applications" title="Applications">
            <p>
              An application stands for one of your projects. Create one per project (or per
              environment) so their keys and limits stay separate.
            </p>
            <h3>Creating one</h3>
            <ul>
              <li>
                <strong>Name</strong>: must be unique across OpenGate, not just among your own
                applications. If it&apos;s taken, add something specific to you.
              </li>
              <li><strong>Description</strong>: optional, for your own reference.</li>
              <li>
                <strong>Throttling policy</strong>: a cap on how many requests{" "}
                <em>all</em> of this application&apos;s tokens can make together. Unlimited by
                default.
              </li>
            </ul>
            <h3>Usage</h3>
            <p>
              An application&apos;s page shows its <strong>Usage</strong> for the last 24 hours,
              7 days or 30 days: how many calls it made, the error rate, how many were throttled
              (<code>429</code>), latency, and a breakdown by API and response status. Calls
              appear a few seconds after they go through the gateway; hover a column for its
              numbers, or open the table view. Calls the gateway rejects before it knows which
              application made them (no token, an invalid token, or a wrong path) aren&apos;t
              counted. Usage is kept for 30 days.
            </p>
            <h3>Editing and deleting</h3>
            <p>
              <strong>Edit</strong> changes the name, description or policy; keys and
              subscriptions are kept. <strong>Delete</strong> removes the application from WSO2
              too: its keys and tokens stop working immediately, and this can&apos;t be undone.
            </p>
          </Section>

          <Section id="subscriptions" title="Subscriptions and tiers">
            <p>
              An application can only call APIs it&apos;s subscribed to. Subscribe from an
              API&apos;s page; the application&apos;s page lists its subscriptions, and you can
              unsubscribe there.
            </p>
            <p>The tiers offered by the sample APIs are:</p>
            <table>
              <thead>
                <tr><th>Tier</th><th>Limit</th></tr>
              </thead>
              <tbody>
                <tr><td>Bronze</td><td>1,000 requests a minute</td></tr>
                <tr><td>Silver</td><td>2,000 requests a minute</td></tr>
                <tr><td>Gold</td><td>5,000 requests a minute</td></tr>
                <tr><td>Unlimited</td><td>No limit from WSO2</td></tr>
              </tbody>
            </table>
            <Note>
              Some upstream APIs have limits of their own, whatever the tier. For example,
              Agify allows 100 names a day and TVMaze 20 calls every 10 seconds. Each API&apos;s
              description mentions these.
            </Note>
          </Section>

          <Section id="keys" title="Keys and access tokens">
            <h3>Production and sandbox</h3>
            <p>
              Each application can have two sets of keys. <strong>Production</strong> keys call
              the API&apos;s live backend. <strong>Sandbox</strong> keys call its sandbox
              backend, if the API has one. Use production unless you know the API has a sandbox.
            </p>
            <h3>Generating keys</h3>
            <p>
              <strong>Generate keys</strong> creates a consumer key and a consumer secret. The
              secret is shown <strong>once</strong>; OpenGate doesn&apos;t store it. Copy it
              straight away.
            </p>
            <h3>Getting an access token</h3>
            <p>
              Click <strong>Get access token</strong> under the keys. Right after generating
              keys it&apos;s one click; later, paste the consumer secret first. Tokens last one
              hour; when one expires, get another.
            </p>
            <h3>Lost the secret?</h3>
            <p>
              Use <strong>Delete keys</strong>, then <strong>Generate keys</strong> again. The
              old secret and every token made from it stop working at once, so update anything
              that used them.
            </p>
            <Note tone="warn">
              <strong>Regenerate secret</strong> is meant to replace a secret in place, but it
              currently fails on WSO2 API Manager 4.7.0. Delete the keys and generate new ones
              instead.
            </Note>
            <Note>
              Treat the secret and tokens like passwords: keep them out of source control and
              client-side code, and use a separate application for each project.
            </Note>
          </Section>

          <Section id="provider-keys" title="Provider keys">
            <p>
              Many APIs need a key from their provider: you&apos;d normally sign up on the
              provider&apos;s site, get a key, and send it with every call. In OpenGate, APIs
              marked <strong>Key included</strong> don&apos;t need that. OpenGate holds the
              provider&apos;s key and the gateway adds it to each call on its way to the
              provider.
            </p>
            <ul>
              <li>Call these APIs with your OpenGate access token only, like any other API.</li>
              <li>
                Don&apos;t send a provider key yourself. The gateway sets its own, and for APIs
                that take the key in the query string your extra one may confuse the provider.
              </li>
              <li>
                You never see the provider&apos;s key. If a provider repeats its key in a response
                (NASA puts it in links, for example), the gateway masks it as{" "}
                <code>*****</code> before the response reaches you.
              </li>
              <li>
                Everyone using a key-included API shares the provider&apos;s quota. To protect
                it, these APIs have a <strong>shared limit</strong> across all developers (for
                example 900 requests an hour), shown under <strong>Details</strong> on the
                API&apos;s page. Past it, the gateway answers <code>429</code> until the limit
                resets, whatever your own tier.
              </li>
            </ul>
          </Section>

          <Section id="calling-an-api" title="Calling an API">
            <p>A call&apos;s address is the gateway, then the API&apos;s context and version, then the endpoint path:</p>
            <Code>{`${GATEWAY}/<context>/<version>/<path>

# for example
${GATEWAY}/weather/1.0.0/forecast?latitude=51.5&longitude=-0.12&current_weather=true`}</Code>
            <p>
              Send the token in the <code>Authorization</code> header. Locally, plain HTTP also
              works on <code>http://localhost:8280</code>.
            </p>
            <Code label="curl">{`curl -k "${GATEWAY}/weather/1.0.0/forecast?latitude=51.5&longitude=-0.12&current_weather=true" \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`}</Code>
            <Code label="JavaScript (Node 18+)">{`const res = await fetch(
  "${GATEWAY}/weather/1.0.0/forecast?latitude=51.5&longitude=-0.12&current_weather=true",
  { headers: { Authorization: \`Bearer \${process.env.ACCESS_TOKEN}\` } },
);
if (!res.ok) throw new Error(\`\${res.status}: \${await res.text()}\`);
console.log(await res.json());`}</Code>
            <Code label="Python (requests)">{`import os, requests

res = requests.get(
    "${GATEWAY}/weather/1.0.0/forecast",
    params={"latitude": 51.5, "longitude": -0.12, "current_weather": "true"},
    headers={"Authorization": f"Bearer {os.environ['ACCESS_TOKEN']}"},
    verify=False,  # local only: WSO2 uses a self-signed certificate
)
res.raise_for_status()
print(res.json())`}</Code>
            <h3>Getting tokens from code</h3>
            <p>
              For long-running services, have your code fetch its own tokens from WSO2 with the
              client-credentials grant, and fetch a new one when it expires:
            </p>
            <Code>{`curl -k -u "$CONSUMER_KEY:$CONSUMER_SECRET" \\
  https://localhost:9443/oauth2/token \\
  -d grant_type=client_credentials`}</Code>
            <p>
              The response&apos;s <code>access_token</code> is the token, and{" "}
              <code>expires_in</code> says how many seconds it lasts.
            </p>
            <h3>Postman</h3>
            <p>
              On the request&apos;s <strong>Authorization</strong> tab, choose{" "}
              <strong>OAuth 2.0</strong> and configure a new token with grant type{" "}
              <strong>Client Credentials</strong>, access token URL{" "}
              <code>https://localhost:9443/oauth2/token</code>, your consumer key and secret, and
              client authentication <strong>Send as Basic Auth header</strong>. Then{" "}
              <strong>Get New Access Token</strong> and <strong>Use Token</strong>. Locally, turn
              off SSL certificate verification in Postman&apos;s settings.
            </p>
            <Note>
              Don&apos;t put the consumer key or secret in the <code>Bearer</code> header
              itself. That&apos;s the most common mistake, and the gateway answers{" "}
              <code>401</code> (900901 Invalid Credentials).
            </Note>
          </Section>

          <Section id="automation" title="Automating with the OpenGate API">
            <p>
              Everything in this site is also available as a REST API, which is handy for
              scripts and CI. Locally it runs on <code>http://localhost:4000</code>, and{" "}
              <code>/openapi.json</code> describes every endpoint for Postman, Swagger UI or a
              client generator.
            </p>
            <Code label="Sign in, create an app, subscribe, get keys and a token">{`API=http://localhost:4000

TOKEN=$(curl -s $API/auth/login -H 'Content-Type: application/json' \\
  -d '{"email":"you@example.com","password":"your-password"}' | jq -r .accessToken)
AUTH="Authorization: Bearer $TOKEN"

APP=$(curl -s $API/applications -H "$AUTH" -H 'Content-Type: application/json' \\
  -d '{"name":"my-service"}' | jq -r .application.id)

API_ID=$(curl -s "$API/apis?limit=1000" | jq -r '.list[] | select(.name=="CatFacts") | .id')
curl -s $API/applications/$APP/subscriptions -H "$AUTH" -H 'Content-Type: application/json' \\
  -d "{\\"apiId\\":\\"$API_ID\\",\\"throttlingPolicy\\":\\"Bronze\\"}"

KEY=$(curl -s $API/applications/$APP/keys -H "$AUTH" -H 'Content-Type: application/json' \\
  -d '{"keyType":"PRODUCTION"}')
SECRET=$(echo "$KEY" | jq -r .key.consumerSecret)   # store this safely
MAPPING=$(echo "$KEY" | jq -r .key.keyMappingId)

curl -s $API/applications/$APP/keys/$MAPPING/token -H "$AUTH" \\
  -H 'Content-Type: application/json' -d "{\\"consumerSecret\\":\\"$SECRET\\"}" \\
  | jq -r .token.accessToken`}</Code>
            <p>
              OpenGate&apos;s own token (from <code>/auth/login</code>) lasts 15 minutes and is
              only for OpenGate. API calls through the gateway use the access token from the
              last step.
            </p>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <p>What the gateway&apos;s responses mean, and what to do about them:</p>
            <table>
              <thead>
                <tr><th>Response</th><th>Cause</th><th>Fix</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>401</code> 900902 Missing Credentials</td>
                  <td>No <code>Authorization</code> header.</td>
                  <td>Add <code>Authorization: Bearer &lt;access token&gt;</code>.</td>
                </tr>
                <tr>
                  <td><code>401</code> 900901 Invalid Credentials</td>
                  <td>The token is expired, mistyped, or it&apos;s the consumer key or secret rather than a token.</td>
                  <td>Get a new access token and send that.</td>
                </tr>
                <tr>
                  <td><code>403</code> 900908 Resource forbidden</td>
                  <td>The token&apos;s application isn&apos;t subscribed to this API.</td>
                  <td>Subscribe that application, or use a token from one that is.</td>
                </tr>
                <tr>
                  <td><code>404</code> No matching resource</td>
                  <td>The API exists but not that path or method.</td>
                  <td>Check the path against the API&apos;s Endpoints.</td>
                </tr>
                <tr>
                  <td><code>404</code> Not Found</td>
                  <td>Wrong context or version, or the API was published moments ago.</td>
                  <td>Check the gateway URL. New APIs take about 15 seconds to come online.</td>
                </tr>
                <tr>
                  <td><code>429</code> 900800 Message throttled out</td>
                  <td>The API&apos;s shared limit across all developers is used up (common on key-included APIs).</td>
                  <td>Wait until the time in the message. A higher tier doesn&apos;t help.</td>
                </tr>
                <tr>
                  <td><code>429</code> (other codes)</td>
                  <td>Your tier&apos;s or application&apos;s limit is used up, or the upstream API&apos;s own limit.</td>
                  <td>Wait, or subscribe on a higher tier.</td>
                </tr>
                <tr>
                  <td>Certificate errors</td>
                  <td>Local WSO2 uses a self-signed certificate.</td>
                  <td>Locally, use <code>-k</code> with curl, or turn off verification.</td>
                </tr>
              </tbody>
            </table>
            <p>And in OpenGate itself:</p>
            <table>
              <tbody>
                <tr>
                  <td>&ldquo;That consumer secret doesn&apos;t match these keys&rdquo;</td>
                  <td>The secret is wrong or belongs to other keys. If it&apos;s lost, delete the keys and generate new ones.</td>
                </tr>
                <tr>
                  <td>&ldquo;This application already has keys for that environment&rdquo;</td>
                  <td>Each application has one set of production and one of sandbox keys. Delete the existing ones to start over.</td>
                </tr>
                <tr>
                  <td>&ldquo;An application with that name already exists&rdquo; (or a <code>409</code>)</td>
                  <td>Names are unique across OpenGate. Pick a more specific one.</td>
                </tr>
                <tr>
                  <td>&ldquo;OpenGate couldn&apos;t authenticate with WSO2&rdquo;</td>
                  <td>A server-side problem, not your credentials. Ask whoever runs OpenGate to check its WSO2 account.</td>
                </tr>
                <tr>
                  <td>Sent back to sign in</td>
                  <td>Sessions last 15 minutes. Sign in again and you&apos;ll return to where you were.</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section id="publishing" title="Publishing APIs">
            <p>
              This part is for whoever runs OpenGate. APIs appear in the catalog once
              they&apos;re <strong>published</strong> in WSO2 with <strong>public</strong>{" "}
              visibility, and their docs come from each API&apos;s OpenAPI definition.
            </p>
            <h3>In the WSO2 Publisher</h3>
            <ol>
              <li>
                Open <code>https://localhost:9443/publisher</code> and choose{" "}
                <strong>Create API → REST API</strong>. Import an OpenAPI file if you have one,
                or start from scratch with a name, context, version and backend URL.
              </li>
              <li>
                Describe the endpoints under <strong>Resources</strong> or{" "}
                <strong>API Definition</strong>: summaries, parameters and examples. This is
                exactly what the Endpoints section shows.
              </li>
              <li>Deploy a revision to the <strong>Default</strong> gateway, then <strong>Publish</strong> it.</li>
            </ol>
            <h3>From the repository</h3>
            <p>
              Add an OpenAPI file to <code>scripts/public-apis/</code>, check it against the
              real API and record real examples, then publish:
            </p>
            <Code>{`node scripts/record-examples.mjs scripts/public-apis/my-api.json
scripts/seed-public-apis.sh`}</Code>
            <p>
              The README&apos;s <em>Sample APIs</em> section describes the file format.
            </p>
            <h3>APIs that need a provider key</h3>
            <p>
              Add a <code>providerKey</code> block to the file&apos;s <code>x-opengate</code>{" "}
              section saying where the key goes and which environment variable holds it, and put
              the key in <code>.env</code> (never in the file):
            </p>
            <Code>{`"providerKey": {
  "in": "header",
  "name": "X-Api-Key",
  "env": "NASA_API_KEY",
  "redact": ["api_key"]
}`}</Code>
            <ul>
              <li><code>in</code>: <code>header</code> or <code>query</code>, wherever the provider expects the key. Prefer <code>header</code> when the provider accepts it.</li>
              <li><code>name</code>: the header or query parameter name.</li>
              <li><code>env</code>: the environment variable (or <code>.env</code> entry) holding the key.</li>
              <li><code>redact</code>: optional; query parameters to mask in responses, for providers that echo the key.</li>
            </ul>
            <p>
              Add <code>&quot;upstreamLimit&quot;: {"{"} &quot;requests&quot;: 900, &quot;per&quot;: &quot;hour&quot; {"}"}</code>{" "}
              to <code>x-opengate</code> to cap the calls all developers together can send to the
              provider (<code>per</code> is <code>min</code>, <code>hour</code> or{" "}
              <code>day</code>), and <code>fallbackLimit</code> inside <code>providerKey</code>{" "}
              for while a demo key is in use. WSO2 counts asynchronously, so a few calls can get
              past the limit: set it a little below the provider&apos;s real quota.
            </p>
            <p>
              The seed script stores the key in WSO2 as encrypted endpoint security, marks the API
              as <strong>Key included</strong>, and installs a response policy that masks the{" "}
              <code>redact</code> parameters. Changing the key in <code>.env</code> and re-running
              the script rotates it. The example recorder refuses an API whose responses contain
              the key unless <code>redact</code> covers it. In the WSO2 Publisher the same thing
              is <strong>Endpoints → Endpoint security → API Key</strong>.
            </p>
          </Section>

          <Section id="faq" title="FAQ">
            <h3>Do I need a WSO2 account?</h3>
            <p>No. OpenGate creates and manages everything in WSO2 for you.</p>
            <h3>Can other developers see my applications?</h3>
            <p>No. Each developer sees and manages only their own.</p>
            <h3>Do I need accounts with each API provider?</h3>
            <p>
              Not for APIs marked <strong>Key included</strong>: OpenGate supplies the
              provider&apos;s key. One OpenGate account and one access token work for every API
              your application is subscribed to.
            </p>
            <h3>Does OpenGate keep my consumer secret?</h3>
            <p>
              No. It&apos;s shown once when the keys are generated. To get a token later, paste
              it in; OpenGate passes it to WSO2 and doesn&apos;t store or log it.
            </p>
            <h3>Why does my token stop working after an hour?</h3>
            <p>Access tokens expire after an hour by design. Get a new one, or have your code fetch tokens itself.</p>
            <h3>Is the example data in the docs real?</h3>
            <p>
              For the sample APIs, yes: example responses were recorded from real calls. They
              may be trimmed, and live data changes over time.
            </p>
          </Section>
        </article>
      </div>
    </div>
  );
}

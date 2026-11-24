import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ApiIcon } from "@/app/ui/api-icon";
import { SiteHeader } from "@/app/ui/site-header";
import { listCatalog, splitDocsLink, type CatalogApi } from "@/lib/apis";
import { categoryLabel } from "@/lib/categories";
import { hasSession } from "@/lib/session";

const STEPS = [
  { title: "Sign up", text: "An email and a password. No WSO2 account needed." },
  { title: "Create an application", text: "It holds your keys and the APIs you subscribe to." },
  { title: "Subscribe", text: "Pick an API from the catalog and a usage tier." },
  { title: "Call it", text: "Get an access token in one click and send it to the gateway." },
];

const POINTS = [
  {
    label: "Documented",
    text: "Each API lists its endpoints, parameters and example responses, with a curl you can paste.",
  },
  {
    label: "Self-service",
    text: "Keys, access tokens and subscriptions without a ticket, and without touching OAuth endpoints.",
  },
  {
    label: "Governed",
    text: "Everything still runs through WSO2 API Manager: its gateway, its tiers, its revocation.",
  },
];

const SAMPLE = `curl "https://<gateway>/weather/1.0.0/forecast?latitude=51.5&longitude=-0.12" \\
  -H "Authorization: Bearer <access token>"

{ "latitude": 51.49, "longitude": -0.13, "current_weather": { … } }`;

export default async function Home() {
  const signedIn = await hasSession();
  const catalog = await listCatalog().catch(() => [] as CatalogApi[]);
  const preview = catalog.slice(0, 6);
  const primary = signedIn
    ? { href: "/dashboard", label: "Open your workspace" }
    : { href: "/register", label: "Create an account" };

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-16 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:pt-24">
          <div className="flex flex-col items-start gap-7">
            <span className="eyebrow">Developer portal for WSO2 API Manager</span>
            <h1 className="display text-6xl sm:text-7xl">
              A front door
              <br />
              for your <em className="text-accent">APIs</em>.
            </h1>
            <p className="max-w-lg text-lg text-muted">
              OpenGate gives developers one place to find your APIs, read how they work, and get
              credentials to call them, while WSO2 keeps doing the enforcing.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={primary.href} className="button-primary px-4 py-2.5">
                {primary.label} <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link href="/docs" className="button-secondary px-4 py-2.5">
                Read the docs
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-end gap-3">
            <span className="eyebrow">What a call looks like</span>
            <pre className="code-block whitespace-pre-wrap p-5 text-[13px] [overflow-wrap:anywhere]">{SAMPLE}</pre>
            <p className="text-xs text-muted">
              Every API is called through the gateway with a bearer token from one of your
              applications.
            </p>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <ol className="mx-auto grid w-full max-w-6xl sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-2 border-border px-4 py-8 sm:px-8 [&:not(:first-child)]:border-t sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l lg:border-t-0 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:border-t-0"
              >
                <span className="font-mono text-xs text-accent">0{i + 1}</span>
                <h2 className="text-lg font-medium">{step.title}</h2>
                <p className="text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-8">
            <h2 className="display text-4xl sm:text-5xl">Less ceremony between a developer and a working call.</h2>
            <dl className="flex flex-col gap-6">
              {POINTS.map((p) => (
                <div key={p.label} className="grid gap-1 border-t border-border pt-4 sm:grid-cols-[130px_1fr] sm:gap-6">
                  <dt className="eyebrow pt-1">{p.label}</dt>
                  <dd className="text-[15px] text-muted">{p.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          {preview.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">In the catalog now</span>
                <span className="font-mono text-xs text-muted">{catalog.length} APIs</span>
              </div>
              <ul className="overflow-hidden rounded-lg border border-border bg-card">
                {preview.map((api) => (
                  <li key={api.id} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
                    <ApiIcon tags={api.tags} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{api.name}</span>
                      <span className="truncate text-xs text-muted">{splitDocsLink(api.description).text}</span>
                    </span>
                    <span className="hidden text-xs text-muted sm:inline">{categoryLabel(api.tags)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/apis" className="inline-flex items-center gap-1 self-start text-sm text-accent hover:underline">
                Browse all of them <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-8">
          <span>OpenGate · a developer gateway for WSO2 API Manager</span>
          <nav className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Documentation</Link>
            <Link href="/docs#troubleshooting" className="hover:text-foreground">Troubleshooting</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

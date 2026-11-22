import {
  ArrowRight,
  Boxes,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListTree,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { ApiIcon } from "@/app/ui/api-icon";
import { Logo } from "@/app/ui/logo";
import { listCatalog, type CatalogApi } from "@/lib/apis";
import { tagLabel } from "@/lib/categories";
import { SESSION_COOKIE } from "@/lib/session";

const FEATURES = [
  { icon: Boxes, title: "One catalog", text: "Every public API in WSO2 API Manager, searchable and grouped by category." },
  { icon: ListTree, title: "Real docs", text: "Endpoints, parameters and example responses for each API, with a ready-to-run curl." },
  { icon: KeyRound, title: "Keys in a click", text: "Generate consumer keys and access tokens without touching OAuth endpoints." },
  { icon: Gauge, title: "Usage tiers", text: "Subscribe on Bronze, Silver, Gold or Unlimited, enforced by the gateway." },
  { icon: ShieldCheck, title: "Your apps only", text: "Every developer sees and manages only the applications they own." },
  { icon: Zap, title: "One gateway", text: "Call everything through WSO2's gateway with a single bearer token." },
];

const STEPS = [
  { title: "Create an account", text: "Just an email and a password." },
  { title: "Create an application", text: "It holds your keys and subscriptions." },
  { title: "Subscribe to APIs", text: "Pick APIs from the catalog and a tier." },
  { title: "Get a token and call", text: "One click for a token, then curl away." },
];

const SAMPLE = `$ curl https://gateway/weather/1.0.0/forecast \\
    ?latitude=51.5&longitude=-0.12&current_weather=true \\
    -H "Authorization: Bearer eyJ4NXQi…"

{
  "current_weather": {
    "temperature": 8.4,
    "windspeed": 14.2,
    "weathercode": 3
  }
}`;

export default async function Home() {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  const catalog = await listCatalog().catch(() => [] as CatalogApi[]);
  const categories = [...new Set(catalog.flatMap((api) => api.tags))].sort();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className="button-primary">
              <LayoutDashboard aria-hidden className="size-4" /> Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="button-ghost">Sign in</Link>
              <Link href="/register" className="button-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="hero-bg">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div className="flex flex-col items-start gap-6">
              <span className="badge-accent">
                <Zap aria-hidden className="size-3.5" /> {catalog.length || "Many"} APIs, one gateway
              </span>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                The developer portal for your{" "}
                <span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
                  WSO2 APIs
                </span>
              </h1>
              <p className="max-w-xl text-lg text-muted">
                Browse documented APIs, create applications, and get working access tokens in
                minutes, without wrestling with OAuth endpoints.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={signedIn ? "/dashboard" : "/register"} className="button-primary px-5 py-2.5">
                  {signedIn ? "Go to your dashboard" : "Create a free account"}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link href="/apis" className="button-secondary px-5 py-2.5">
                  <Boxes aria-hidden className="size-4" /> Explore the catalog
                </Link>
              </div>
            </div>

            <div className="card overflow-hidden p-0 shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
                <span className="size-3 rounded-full bg-rose-400" />
                <span className="size-3 rounded-full bg-amber-400" />
                <span className="size-3 rounded-full bg-emerald-400" />
                <span className="ml-3 text-xs text-muted">Calling an API through the gateway</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed sm:text-sm">{SAMPLE}</pre>
            </div>
          </div>
        </section>

        {catalog.length > 0 && (
          <section className="border-y border-border bg-card">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
              <p className="text-sm font-medium text-muted">Ready-to-use APIs across {categories.length} categories</p>
              <ul className="flex flex-wrap gap-3">
                {categories.map((tag) => (
                  <li key={tag} className="badge gap-2 py-1 pl-1 pr-3 text-sm">
                    <ApiIcon tags={[tag]} size="sm" />
                    {tagLabel(tag)}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">Everything you need to ship an integration</h2>
            <p className="text-muted">OpenGate sits in front of WSO2 API Manager and keeps the hard parts out of your way.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card flex flex-col gap-3">
                <span className="icon-tile size-11">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">From zero to first call in four steps</h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="card flex flex-col gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-[var(--accent-foreground)]">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="hero-bg card flex flex-wrap items-center justify-between gap-4 p-8">
            <div>
              <h2 className="text-xl font-semibold">Ready to build?</h2>
              <p className="text-sm text-muted">It takes a minute to set up an account.</p>
            </div>
            <Link href={signedIn ? "/dashboard" : "/register"} className="button-primary px-5 py-2.5">
              {signedIn ? "Open dashboard" : "Get started"} <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>OpenGate · a developer gateway for WSO2 API Manager</span>
          <span>Example output is illustrative.</span>
        </div>
      </footer>
    </div>
  );
}

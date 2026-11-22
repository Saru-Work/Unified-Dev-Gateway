import {
  AppWindow,
  ArrowRight,
  Boxes,
  CircleCheck,
  Circle,
  KeyRound,
  Layers,
  Plus,
  Rocket,
  Terminal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiIcon } from "@/app/ui/api-icon";
import { CopyButton } from "@/app/copy-button";
import { listCatalog, splitDocsLink, type CatalogApi } from "@/lib/apis";
import { backend } from "@/lib/backend";
import { categoryFor } from "@/lib/categories";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Application, ApplicationKey, Subscription } from "@/lib/types";

export const metadata: Metadata = { title: "Overview · OpenGate" };

/** Subscriptions and keys per app; an app WSO2 can't answer for counts as having none. */
async function usage(applications: Application[], token: string) {
  return Promise.all(
    applications.map(async (app) => {
      const id = encodeURIComponent(app.id);
      const [subs, keys] = await Promise.all([
        backend<{ subscriptions: Subscription[] }>(`/applications/${id}/subscriptions`, { token })
          .then((r) => r.subscriptions.length)
          .catch(() => 0),
        backend<{ keys: ApplicationKey[] }>(`/applications/${id}/keys`, { token })
          .then((r) => r.keys.length)
          .catch(() => 0),
      ]);
      return { subs, keys };
    }),
  );
}

/** One API from each category, so the picks show the range on offer. */
function featured(apis: CatalogApi[], count: number): CatalogApi[] {
  const seen = new Set<unknown>();
  const picks: CatalogApi[] = [];
  for (const api of apis) {
    const { icon } = categoryFor(api.tags);
    if (seen.has(icon)) continue;
    seen.add(icon);
    picks.push(api);
  }
  for (const api of apis) if (picks.length < count && !picks.includes(api)) picks.push(api);
  return picks.slice(0, count);
}

function Stat({ icon: Icon, label, value, href, tone }: {
  icon: typeof AppWindow;
  label: string;
  value: number;
  href: string;
  tone: string;
}) {
  return (
    <Link href={href} className="card card-link flex items-center gap-4">
      <span className={`icon-tile ${tone} size-11`}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-sm text-muted">{label}</span>
      </span>
    </Link>
  );
}

export default async function OverviewPage() {
  const { user, token } = await requireUser();
  const [{ applications }, catalog] = await Promise.all([
    backend<{ applications: Application[] }>("/applications", { token }),
    listCatalog().catch(() => [] as CatalogApi[]),
  ]);
  const perApp = await usage(applications, token);
  const subscriptions = perApp.reduce((n, a) => n + a.subs, 0);
  const appsWithKeys = perApp.filter((a) => a.keys > 0).length;

  const steps = [
    {
      done: applications.length > 0,
      title: "Create an application",
      text: "An application holds your keys and subscriptions.",
      href: "/applications/new",
      cta: "New application",
    },
    {
      done: subscriptions > 0,
      title: "Subscribe to an API",
      text: "Pick an API from the catalog and a usage tier.",
      href: "/apis",
      cta: "Browse APIs",
    },
    {
      done: appsWithKeys > 0,
      title: "Generate keys",
      text: "Create a consumer key and secret on your application's page.",
      href: applications[0] ? `/applications/${applications[0].id}` : "/applications",
      cta: "Open application",
    },
    {
      done: false,
      title: "Get a token and make a call",
      text: "Use Get access token, then call the API through the gateway.",
      href: applications[0] ? `/applications/${applications[0].id}` : "/applications",
      cta: "Get a token",
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  const example = "curl -k https://localhost:8243/catfacts/1.0.0/fact \\\n  -H 'Authorization: Bearer <access token>'";

  return (
    <>
      <section className="hero-bg card relative overflow-hidden p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex max-w-xl flex-col gap-2">
            <span className="badge-accent w-fit">
              <Rocket aria-hidden className="size-3.5" /> Developer portal
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-muted">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>.{" "}
              {catalog.length} APIs are ready to use: subscribe an application and start calling them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/apis" className="button-secondary">
              <Boxes aria-hidden className="size-4" /> Browse APIs
            </Link>
            <Link href="/applications/new" className="button-primary">
              <Plus aria-hidden className="size-4" /> New application
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Your numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={AppWindow} label="Applications" value={applications.length} href="/applications" tone="tone-indigo" />
        <Stat icon={Layers} label="Subscriptions" value={subscriptions} href="/applications" tone="tone-violet" />
        <Stat icon={KeyRound} label="Apps with keys" value={appsWithKeys} href="/applications" tone="tone-emerald" />
        <Stat icon={Boxes} label="APIs available" value={catalog.length} href="/apis" tone="tone-sky" />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card flex min-w-0 flex-col gap-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Getting started</h2>
              <p className="text-sm text-muted">From sign-up to your first API call.</p>
            </div>
            <span className="badge">{completed} of {steps.length} done</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${(completed / steps.length) * 100}%` }} />
          </div>
          <ol className="flex flex-col gap-1">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3 rounded-lg p-2 hover:bg-surface">
                {step.done ? (
                  <CircleCheck aria-label="Done" className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <Circle aria-label="To do" className="mt-0.5 size-5 shrink-0 text-muted" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={`text-sm font-medium ${step.done ? "text-muted line-through" : ""}`}>
                    {i + 1}. {step.title}
                  </span>
                  <span className="text-xs text-muted">{step.text}</span>
                </div>
                {!step.done && (
                  <Link href={step.href} className="link inline-flex shrink-0 items-center gap-1 text-sm">
                    {step.cta} <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="card flex min-w-0 flex-col gap-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Terminal aria-hidden className="size-4.5 text-accent" />
            <h2 className="text-lg font-semibold">Your first call</h2>
          </div>
          <p className="text-sm text-muted">
            Every API is called through the gateway with an access token from one of your
            subscribed applications.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">{example}</pre>
          <div className="flex items-center justify-between gap-2">
            <Link href="/apis" className="link text-sm">Each API&apos;s page has its own examples</Link>
            <CopyButton value={example} />
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="flex min-w-0 flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent applications</h2>
            <Link href="/applications" className="link text-sm">View all</Link>
          </div>
          {applications.length === 0 ? (
            <div className="card flex flex-col items-start gap-3 border-dashed">
              <p className="text-sm text-muted">You haven&apos;t created an application yet.</p>
              <Link href="/applications/new" className="button-primary">
                <Plus aria-hidden className="size-4" /> Create one
              </Link>
            </div>
          ) : (
            <ul className="card flex flex-col divide-y divide-border p-0">
              {applications.slice(0, 4).map((app, i) => (
                <li key={app.id}>
                  <Link href={`/applications/${app.id}`} className="flex items-center gap-3 p-4 hover:bg-surface">
                    <span className="icon-tile tone-indigo size-9">
                      <AppWindow aria-hidden className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{app.name}</span>
                      <span className="text-xs text-muted">{formatDate(app.createdAt)}</span>
                    </span>
                    <span className="badge">
                      <Layers aria-hidden className="size-3" /> {perApp[i]?.subs ?? 0}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Featured APIs</h2>
            <Link href="/apis" className="link text-sm">Browse all {catalog.length}</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {featured(catalog, 6).map((api) => (
              <li key={api.id}>
                <Link href={`/apis/${api.id}`} className="card card-link flex h-full items-start gap-3 p-4">
                  <ApiIcon tags={api.tags} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{api.name}</span>
                    <span className="line-clamp-2 text-xs text-muted">{splitDocsLink(api.description).text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

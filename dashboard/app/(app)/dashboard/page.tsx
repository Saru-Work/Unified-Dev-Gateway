import { ArrowRight, Check, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/app/copy-button";
import { ApiIcon } from "@/app/ui/api-icon";
import { PageHeader } from "@/app/ui/page-header";
import { listCatalog, splitDocsLink, type CatalogApi } from "@/lib/apis";
import { backend } from "@/lib/backend";
import { categoryKey } from "@/lib/categories";
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
    const category = categoryKey(api.tags);
    if (seen.has(category)) continue;
    seen.add(category);
    picks.push(api);
  }
  for (const api of apis) if (picks.length < count && !picks.includes(api)) picks.push(api);
  return picks.slice(0, count);
}

export default async function OverviewPage() {
  const { token } = await requireUser();
  const [{ applications }, catalog] = await Promise.all([
    backend<{ applications: Application[] }>("/applications", { token }),
    listCatalog().catch(() => [] as CatalogApi[]),
  ]);
  const perApp = await usage(applications, token);
  const subscriptions = perApp.reduce((n, a) => n + a.subs, 0);
  const appsWithKeys = perApp.filter((a) => a.keys > 0).length;
  const firstApp = applications[0] ? `/applications/${applications[0].id}` : "/applications/new";

  const steps = [
    { done: applications.length > 0, title: "Create an application", href: "/applications/new", cta: "Create" },
    { done: subscriptions > 0, title: "Subscribe it to an API", href: "/apis", cta: "Browse APIs" },
    { done: appsWithKeys > 0, title: "Generate keys", href: firstApp, cta: "Open app" },
    { done: false, title: "Get an access token and call the API", href: "/docs#calling-an-api", cta: "How" },
  ];
  const stats = [
    { label: "Applications", value: applications.length, href: "/applications" },
    { label: "Subscriptions", value: subscriptions, href: "/applications" },
    { label: "Apps with keys", value: appsWithKeys, href: "/applications" },
    { label: "APIs in the catalog", value: catalog.length, href: "/apis" },
  ];
  const example = "curl -k https://localhost:8243/catfacts/1.0.0/fact \\\n  -H 'Authorization: Bearer <access token>'";

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Your workspace"
        description="Where your applications stand, and what to do next."
        actions={
          <Link href="/apis" className="button-secondary">
            Browse APIs
          </Link>
        }
      />

      <section aria-label="Numbers" className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-4">
        {stats.map((s, i) => (
          <Link
            key={s.label}
            href={s.href}
            className={
              "flex flex-col gap-1 p-5 transition-colors hover:bg-surface/50 " +
              (i % 2 ? "border-l border-border " : "") +
              (i >= 2 ? "border-t border-border lg:border-t-0 " : "") +
              (i === 2 ? "lg:border-l" : "")
            }
          >
            <span className="eyebrow">{s.label}</span>
            <span className="display text-5xl tabular-nums">{s.value}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Next steps</h2>
            <span className="eyebrow">{steps.filter((s) => s.done).length}/{steps.length}</span>
          </div>
          <ol className="flex flex-col border-t border-border">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-center gap-4 border-b border-border py-3">
                <span
                  className={
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] " +
                    (step.done ? "border-success/40 bg-success/10 text-success" : "border-border-strong text-muted")
                  }
                >
                  {step.done ? <Check aria-label="Done" className="size-3.5" /> : i + 1}
                </span>
                <span className={`flex-1 text-sm ${step.done ? "text-muted line-through decoration-border-strong" : ""}`}>
                  {step.title}
                </span>
                {!step.done && (
                  <Link href={step.href} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                    {step.cta} <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Calling an API</h2>
            <Link href="/docs#calling-an-api" className="text-sm text-accent hover:underline">Read the guide</Link>
          </div>
          <p className="text-sm text-muted">
            Every API is reached through the WSO2 gateway, with an access token from one of your
            subscribed applications.
          </p>
          <pre className="code-block">{example}</pre>
          <div>
            <CopyButton value={example} />
          </div>
        </section>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">Recent applications</h2>
            <Link href="/applications" className="text-sm text-accent hover:underline">All applications</Link>
          </div>
          {applications.length === 0 ? (
            <div className="flex flex-col items-start gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted">You haven&apos;t created an application yet.</p>
              <Link href="/applications/new" className="button-primary">
                <Plus aria-hidden className="size-4" /> New application
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col border-t border-border">
              {applications.slice(0, 5).map((app, i) => (
                <li key={app.id}>
                  <Link href={`/applications/${app.id}`} className="group flex items-baseline gap-4 border-b border-border py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-accent">{app.name}</span>
                    <span className="font-mono text-xs text-muted">
                      {perApp[i]?.subs ?? 0} sub{perApp[i]?.subs === 1 ? "" : "s"}
                    </span>
                    <span className="hidden font-mono text-xs text-muted sm:inline">{formatDate(app.createdAt).split(",")[0]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">From the catalog</h2>
            <Link href="/apis" className="text-sm text-accent hover:underline">All {catalog.length} APIs</Link>
          </div>
          <ul className="flex flex-col border-t border-border">
            {featured(catalog, 5).map((api) => (
              <li key={api.id}>
                <Link href={`/apis/${api.id}`} className="group flex items-center gap-3 border-b border-border py-3">
                  <ApiIcon tags={api.tags} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium group-hover:text-accent">{api.name}</span>
                    <span className="truncate text-xs text-muted">{splitDocsLink(api.description).text}</span>
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

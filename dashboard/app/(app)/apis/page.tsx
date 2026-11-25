import { ChevronRight, KeyRound, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiIcon } from "@/app/ui/api-icon";
import { EmptyState } from "@/app/ui/empty-state";
import { HealthBadge } from "@/app/ui/health-badge";
import { PageHeader } from "@/app/ui/page-header";
import { listCatalog, splitDocsLink, type CatalogApi } from "@/lib/apis";
import { categoryLabel, tagLabel } from "@/lib/categories";
import { loadHealth } from "@/lib/health";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "API catalog · OpenGate" };

function matches(api: CatalogApi, query: string): boolean {
  const q = query.toLowerCase();
  return [api.name, api.description, api.context, api.provider, ...api.tags].some((value) =>
    value?.toLowerCase().includes(q),
  );
}

/** Link to the catalog with a filter changed, keeping the other one. */
function href(query: string, tag: string | undefined): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag) params.set("tag", tag);
  const qs = params.toString();
  return qs ? `/apis?${qs}` : "/apis";
}

export default async function ApisPage({ searchParams }: PageProps<"/apis">) {
  await requireUser();
  const { q, tag: rawTag } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const tag = typeof rawTag === "string" && rawTag ? rawTag : undefined;

  const [all, health] = await Promise.all([listCatalog(), loadHealth()]);
  const searched = query ? all.filter((api) => matches(api, query)) : all;
  const apis = tag ? searched.filter((api) => api.tags.includes(tag)) : searched;

  const tagCounts = new Map<string, number>();
  for (const api of searched) for (const t of api.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="APIs"
        description="Every public API published in WSO2 API Manager. Open one for its endpoints, parameters and examples, then subscribe an application to it."
      />

      <div className="flex flex-col gap-4">
        <form role="search" className="relative max-w-lg">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field pl-9"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search name, description, context or tag"
            aria-label="Search APIs"
          />
        </form>

        {tags.length > 0 && (
          <nav aria-label="Categories" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link
              href={href(query, undefined)}
              aria-current={!tag ? "page" : undefined}
              className={!tag ? "font-medium text-foreground underline decoration-accent decoration-2 underline-offset-[6px]" : "text-muted hover:text-foreground"}
            >
              All <span className="font-mono text-xs text-muted">{searched.length}</span>
            </Link>
            {tags.map(([t, count]) => (
              <Link
                key={t}
                href={href(query, t === tag ? undefined : t)}
                aria-current={t === tag ? "page" : undefined}
                className={t === tag ? "font-medium text-foreground underline decoration-accent decoration-2 underline-offset-[6px]" : "text-muted hover:text-foreground"}
              >
                {tagLabel(t)} <span className="font-mono text-xs text-muted">{count}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {apis.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon={SearchX} title="No APIs published yet">
            APIs show up here once they&apos;re published in the WSO2 Publisher portal.
          </EmptyState>
        ) : (
          <EmptyState
            icon={SearchX}
            title={query ? `Nothing matches “${query}”` : "No APIs in this category"}
            action={<Link href="/apis" className="button-secondary">Clear filters</Link>}
          />
        )
      ) : (
        <div className="flex flex-col gap-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_150px_20px] gap-6 px-4 lg:grid">
            <span className="eyebrow">{apis.length} {apis.length === 1 ? "API" : "APIs"}</span>
            <span className="eyebrow">Category</span>
            <span className="eyebrow">Context</span>
          </div>
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {apis.map((api) => (
              <li key={api.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/apis/${api.id}`}
                  className="group grid items-center gap-x-6 gap-y-1 px-4 py-4 transition-colors hover:bg-surface/50 lg:grid-cols-[minmax(0,1fr)_120px_150px_20px]"
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <ApiIcon tags={api.tags} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-baseline gap-2">
                        <span className="font-medium group-hover:text-accent">{api.name}</span>
                        <span className="font-mono text-[11px] text-muted">v{api.version}</span>
                        {api.providerKeyIncluded && (
                          <span className="badge-accent" title="OpenGate adds the provider's API key">
                            <KeyRound aria-hidden className="size-3" /> Key included
                          </span>
                        )}
                        <HealthBadge health={health.get(api.id)} problemsOnly />
                      </span>
                      <span className="line-clamp-1 text-sm text-muted">{splitDocsLink(api.description).text}</span>
                    </span>
                  </span>
                  <span className="hidden text-sm text-muted lg:block">{categoryLabel(api.tags)}</span>
                  <code className="hidden truncate font-mono text-xs text-muted lg:block">{api.context}</code>
                  <ChevronRight aria-hidden className="hidden size-4 text-border-strong transition-colors group-hover:text-foreground lg:block" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

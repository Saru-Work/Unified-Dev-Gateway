import { ArrowUpRight, Boxes, Layers, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApiIcon } from "@/app/ui/api-icon";
import { EmptyState } from "@/app/ui/empty-state";
import { PageHeader } from "@/app/ui/page-header";
import { listCatalog, splitDocsLink, type CatalogApi } from "@/lib/apis";
import { tagLabel } from "@/lib/categories";
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

  const all = await listCatalog();
  const searched = query ? all.filter((api) => matches(api, query)) : all;
  const apis = tag ? searched.filter((api) => api.tags.includes(tag)) : searched;

  const tagCounts = new Map<string, number>();
  for (const api of searched) for (const t of api.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <>
      <PageHeader
        icon={Boxes}
        title="API catalog"
        description="Every public API published in WSO2 API Manager. Open one for its endpoints, parameters and examples, then subscribe an application."
      />

      <div className="flex flex-col gap-4">
        <form role="search" className="relative max-w-xl">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field py-2.5 pl-9"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name, description, context or tag"
            aria-label="Search APIs"
          />
        </form>

        {tags.length > 0 && (
          <nav aria-label="Categories" className="flex flex-wrap gap-2">
            <Link
              href={href(query, undefined)}
              aria-current={!tag ? "page" : undefined}
              className={!tag ? "badge-accent px-3 py-1" : "badge px-3 py-1 hover:text-foreground"}
            >
              All <span className="opacity-70">{searched.length}</span>
            </Link>
            {tags.map(([t, count]) => (
              <Link
                key={t}
                href={href(query, t === tag ? undefined : t)}
                aria-current={t === tag ? "page" : undefined}
                className={t === tag ? "badge-accent px-3 py-1" : "badge px-3 py-1 hover:text-foreground"}
              >
                {tagLabel(t)} <span className="opacity-70">{count}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      {apis.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon={Boxes} title="No APIs published yet">
            APIs show up here once they&apos;re published in the WSO2 Publisher portal.
          </EmptyState>
        ) : (
          <EmptyState
            icon={SearchX}
            title={query ? `No APIs match “${query}”` : "No APIs in this category"}
            action={<Link href="/apis" className="button-secondary">Clear filters</Link>}
          />
        )
      ) : (
        <>
          <p className="-mb-4 text-sm text-muted">
            {apis.length} {apis.length === 1 ? "API" : "APIs"}
            {tag && <> in {tagLabel(tag)}</>}
            {query && <> matching “{query}”</>}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {apis.map((api) => (
              <li key={api.id}>
                <Link
                  href={`/apis/${api.id}`}
                  className="card card-link group flex h-full flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    <ApiIcon tags={api.tags} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{api.name}</span>
                        <ArrowUpRight
                          aria-hidden
                          className="ml-auto size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </span>
                      <span className="text-xs text-muted">
                        v{api.version}
                        {api.provider && <> · by {api.provider}</>}
                      </span>
                    </div>
                  </div>
                  {api.description && (
                    <p className="line-clamp-3 text-sm text-muted">{splitDocsLink(api.description).text}</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <code className="font-mono text-xs text-muted">{api.context}</code>
                    {api.tierCount > 0 && (
                      <span className="badge ml-auto">
                        <Layers aria-hidden className="size-3" />
                        {api.tierCount} {api.tierCount === 1 ? "tier" : "tiers"}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

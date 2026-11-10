import type { Metadata } from "next";
import { backend } from "@/lib/backend";
import { requireUser } from "@/lib/session";
import type { Wso2Api, Wso2ApiList } from "@/lib/types";

export const metadata: Metadata = { title: "APIs · OpenGate" };

function matches(api: Wso2Api, query: string): boolean {
  const q = query.toLowerCase();
  return [api.name, api.description, api.context, api.provider].some((value) =>
    value?.toLowerCase().includes(q),
  );
}

export default async function ApisPage({ searchParams }: PageProps<"/apis">) {
  await requireUser();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const { list = [] } = await backend<Wso2ApiList>("/apis");
  const apis = query ? list.filter((api) => matches(api, query)) : list;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">APIs</h1>
        <p className="text-sm text-muted">
          Public APIs published in WSO2 API Manager.
        </p>
      </div>

      <form role="search" className="flex max-w-md gap-2">
        <input
          className="field"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name, context or provider"
          aria-label="Search APIs"
        />
        <button type="submit" className="button-secondary">
          Search
        </button>
      </form>

      {apis.length === 0 ? (
        <div className="card">
          <p className="font-medium">
            {query ? `No APIs match “${query}”` : "No APIs published yet"}
          </p>
          {!query && (
            <p className="text-sm text-muted">
              APIs show up here once they&apos;re published in the WSO2
              Publisher portal.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {apis.map((api) => (
            <li key={api.id} className="card flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{api.name}</span>
                {api.version && (
                  <span className="text-xs text-muted">v{api.version}</span>
                )}
                {api.lifeCycleStatus && (
                  <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs">
                    {api.lifeCycleStatus}
                  </span>
                )}
              </div>
              {api.description && (
                <p className="text-sm text-muted">{api.description}</p>
              )}
              <div className="mt-auto flex flex-wrap gap-x-4 text-xs text-muted">
                {api.context && <code className="font-mono">{api.context}</code>}
                {api.provider && <span>by {api.provider}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

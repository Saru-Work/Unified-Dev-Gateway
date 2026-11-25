import { ArrowUpRight, KeyRound, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CopyButton } from "@/app/copy-button";
import { ApiIcon } from "@/app/ui/api-icon";
import { HealthBadge } from "@/app/ui/health-badge";
import { PageHeader } from "@/app/ui/page-header";
import { backend, BackendError, describeError } from "@/lib/backend";
import { apiProperty, providerKeyIncluded, splitDocsLink } from "@/lib/apis";
import { tagLabel } from "@/lib/categories";
import { formatPercent } from "@/lib/format";
import { loadHealth } from "@/lib/health";
import { loadSavedApis } from "@/lib/saved-apis";
import { requireUser } from "@/lib/session";
import type { ApiOperation, Application, Wso2ApiDetail } from "@/lib/types";
import { EndpointsSection } from "./endpoints-section";
import { SaveButton } from "./save-button";
import { SubscribeForm } from "./subscribe-form";

const getApi = cache(async (id: string): Promise<Wso2ApiDetail> => {
  await requireUser();
  try {
    return await backend<Wso2ApiDetail>(`/apis/${encodeURIComponent(id)}`);
  } catch (err) {
    // WSO2 answers 404 for unknown APIs and ones that aren't public.
    if (err instanceof BackendError && err.status === 404) notFound();
    throw err;
  }
});

export async function generateMetadata({ params }: PageProps<"/apis/[id]">): Promise<Metadata> {
  const api = await getApi((await params).id);
  return { title: `${api.name} · OpenGate` };
}

export default async function ApiPage({ params }: PageProps<"/apis/[id]">) {
  const { token } = await requireUser();
  const { id } = await params;
  const [api, { applications }, docs, healthById, saved] = await Promise.all([
    getApi(id),
    backend<{ applications: Application[] }>("/applications", { token }),
    backend<{ operations: ApiOperation[] }>(`/apis/${encodeURIComponent(id)}/operations`).then(
      ({ operations }) => ({ operations, error: undefined }),
      (err: unknown) => ({ operations: [], error: describeError(err) }),
    ),
    loadHealth(),
    loadSavedApis(),
  ]);
  const health = healthById.get(id);
  const tiers = (api.tiers ?? []).map((t) => t.tierName);
  const endpoints = (api.endpointURLs ?? []).flatMap((env) =>
    [env.URLs?.https, env.URLs?.http]
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ env: env.environmentDisplayName ?? env.environmentName, url })),
  );
  const { text, docs: docsUrl } = splitDocsLink(api.description);
  const sharedLimit = apiProperty(api, "upstreamLimit");

  return (
    <>
      <PageHeader
        back={{ href: "/apis", label: "API catalog" }}
        media={<ApiIcon tags={api.tags} size="lg" />}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            API · v{api.version}
            {api.lifeCycleStatus && <span className="badge-success normal-case">{api.lifeCycleStatus.toLowerCase()}</span>}
            <HealthBadge health={health} />
          </span>
        }
        title={api.name}
        description={text || undefined}
        actions={
          <>
            <SaveButton apiId={api.id} saved={saved.has(api.id)} />
            {docsUrl && (
              <a href={docsUrl} target="_blank" rel="noreferrer" className="button-secondary">
                Provider docs <ArrowUpRight aria-hidden className="size-4" />
              </a>
            )}
          </>
        }
      />

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {providerKeyIncluded(api) && (
            <div className="flex gap-3 rounded-lg border border-accent/30 bg-accent-soft p-4 text-sm">
              <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              <p>
                <strong className="font-medium">Provider key included.</strong> This API normally
                needs its own key from the provider; OpenGate adds it for you at the gateway. Call it
                with your OpenGate access token only, and don&apos;t send a provider key yourself.
                {sharedLimit && (
                  <>
                    {" "}Calls are capped at <strong className="font-medium">{sharedLimit}</strong>{" "}
                    to protect the provider&apos;s quota; past that the gateway answers 429.
                  </>
                )}{" "}
                <Link href="/docs#provider-keys" className="link">How this works</Link>
              </p>
            </div>
          )}
          <EndpointsSection operations={docs.operations} baseUrl={endpoints[0]?.url} error={docs.error} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
          <section className="card flex flex-col gap-4">
            <h2 className="eyebrow">Subscribe</h2>
            {applications.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted">You need an application to subscribe with.</p>
                <Link href="/applications/new" className="button-primary">
                  <Plus aria-hidden className="size-4" /> Create an application
                </Link>
              </div>
            ) : tiers.length === 0 ? (
              <p className="text-sm text-muted">This API doesn&apos;t offer any subscription tiers.</p>
            ) : (
              <>
                <p className="text-sm text-muted">Let one of your applications call this API.</p>
                <SubscribeForm
                  apiId={api.id}
                  applications={applications.map(({ id, name }) => ({ id, name }))}
                  tiers={tiers}
                />
              </>
            )}
          </section>

          <section className="card flex flex-col gap-4">
            <h2 className="eyebrow">Details</h2>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              {api.context && (
                <>
                  <dt className="text-muted">Context</dt>
                  <dd><code className="font-mono">{api.context}</code></dd>
                </>
              )}
              {api.provider && (
                <>
                  <dt className="text-muted">Provider</dt>
                  <dd>{api.provider}</dd>
                </>
              )}
              <dt className="text-muted">Endpoints</dt>
              <dd>{docs.operations.length}</dd>
              {health?.successRate !== undefined && (
                <>
                  <dt className="text-muted">Success rate</dt>
                  <dd title="Last 6 hours, all applications">{formatPercent(health.successRate)}</dd>
                </>
              )}
              {health?.avgLatencyMs !== undefined && (
                <>
                  <dt className="text-muted">Avg latency</dt>
                  <dd title="Last 6 hours, all applications">{health.avgLatencyMs.toLocaleString("en")} ms</dd>
                </>
              )}
              {sharedLimit && (
                <>
                  <dt className="text-muted">Shared limit</dt>
                  <dd>{sharedLimit}</dd>
                </>
              )}
            </dl>
            {tiers.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">Tiers</span>
                <div className="flex flex-wrap gap-1.5">
                  {tiers.map((t) => <span key={t} className="badge">{t}</span>)}
                </div>
              </div>
            )}
            {api.tags && api.tags.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {api.tags.map((t) => (
                    <Link key={t} href={`/apis?tag=${encodeURIComponent(t)}`} className="badge-accent hover:underline">
                      {tagLabel(t)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {endpoints.length > 0 && (
            <section className="card flex flex-col gap-3">
              <h2 className="eyebrow">Gateway URLs</h2>
              <ul className="flex flex-col gap-3">
                {endpoints.map(({ env, url }) => (
                  <li key={url} className="flex flex-col gap-1">
                    {env && <span className="text-xs text-muted">{env} · {url.split(":")[0].toUpperCase()}</span>}
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs" title={url}>
                        {url}
                      </code>
                      <CopyButton value={url} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

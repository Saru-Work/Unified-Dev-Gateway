import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { backend, BackendError } from "@/lib/backend";
import { requireUser } from "@/lib/session";
import type { Application, Wso2ApiDetail } from "@/lib/types";
import { Wso2TokenNotice } from "../../wso2-token-notice";
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
  const [api, { applications }] = await Promise.all([
    getApi((await params).id),
    backend<{ applications: Application[] }>("/applications", { token }),
  ]);
  const tiers = (api.tiers ?? []).map((t) => t.tierName);
  const endpoints = (api.endpointURLs ?? []).flatMap((env) =>
    [env.URLs?.https, env.URLs?.http]
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ env: env.environmentDisplayName ?? env.environmentName, url })),
  );

  return (
    <>
      <div>
        <Link href="/apis" className="text-sm text-muted hover:text-foreground">
          ← APIs
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{api.name}</h1>
          {api.version && <span className="text-muted">v{api.version}</span>}
          {api.lifeCycleStatus && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs">
              {api.lifeCycleStatus}
            </span>
          )}
        </div>
        {api.description && <p className="mt-2 max-w-3xl text-muted">{api.description}</p>}
      </div>

      <dl className="card grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {api.context && (
          <>
            <dt className="text-sm font-medium text-muted">Context</dt>
            <dd><code className="font-mono text-sm">{api.context}</code></dd>
          </>
        )}
        {api.provider && (
          <>
            <dt className="text-sm font-medium text-muted">Provider</dt>
            <dd>{api.provider}</dd>
          </>
        )}
        {api.tiers && api.tiers.length > 0 && (
          <>
            <dt className="text-sm font-medium text-muted">Subscription tiers</dt>
            <dd>{api.tiers.map((t) => t.tierName).join(", ")}</dd>
          </>
        )}
        {api.tags && api.tags.length > 0 && (
          <>
            <dt className="text-sm font-medium text-muted">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {api.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-surface px-2 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      <section className="card flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Subscribe</h2>
          <p className="text-sm text-muted">
            Let one of your applications call this API.
          </p>
        </div>
        <Wso2TokenNotice action="subscribe" />
        {applications.length === 0 ? (
          <p className="text-sm">
            You don&apos;t have any applications yet.{" "}
            <Link href="/applications/new" className="link">
              Create one
            </Link>{" "}
            first.
          </p>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-muted">
            This API doesn&apos;t offer any subscription tiers.
          </p>
        ) : (
          <SubscribeForm
            apiId={api.id}
            applications={applications.map(({ id, name }) => ({ id, name }))}
            tiers={tiers}
          />
        )}
      </section>

      {endpoints.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Gateway endpoints</h2>
          <ul className="card flex flex-col gap-2">
            {endpoints.map(({ env, url }) => (
              <li key={url} className="flex flex-wrap gap-x-3">
                {env && <span className="text-sm text-muted">{env}</span>}
                <code className="break-all font-mono text-sm">{url}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

import Link from "next/link";
import { backend, describeError } from "@/lib/backend";
import { requireUser } from "@/lib/session";
import type { Subscription } from "@/lib/types";
import { UnsubscribeButton } from "./unsubscribe-button";

export async function SubscriptionsSection({ applicationId }: { applicationId: string }) {
  const { token } = await requireUser();

  let subscriptions: Subscription[] = [];
  let error: string | undefined;
  try {
    ({ subscriptions } = await backend<{ subscriptions: Subscription[] }>(
      `/applications/${encodeURIComponent(applicationId)}/subscriptions`,
      { token },
    ));
  } catch (err) {
    error = describeError(err);
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="display text-2xl">Subscriptions</h2>
        <p className="text-sm text-muted">
          APIs this application&apos;s keys can call.
        </p>
      </div>

      {error ? (
        <p className="notice-error">Couldn&apos;t load subscriptions: {error}</p>
      ) : subscriptions.length === 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-dashed text-sm">
          <span className="text-muted">Not subscribed to any APIs yet.</span>
          <Link href="/apis" className="button-secondary">
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="card flex flex-col divide-y divide-border p-0">
          {subscriptions.map((sub) => {
            const name = sub.apiName ?? sub.apiId;
            return (
              <li key={sub.subscriptionId} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/apis/${sub.apiId}`} className="font-medium hover:underline">
                    {name}
                    {sub.apiVersion && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        v{sub.apiVersion}
                      </span>
                    )}
                  </Link>
                  <span className="text-xs text-muted">
                    {[sub.throttlingPolicy && `${sub.throttlingPolicy} tier`, sub.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <UnsubscribeButton
                  applicationId={applicationId}
                  subscriptionId={sub.subscriptionId}
                  apiName={name}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

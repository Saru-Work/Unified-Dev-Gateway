import type { Wso2Transport } from "../integrations/wso2/client";
import type { Wso2ApplicationService } from "./Wso2ApplicationService";
import { AppError } from "../errors/AppError";

/** A subscription of one of the user's apps to an API, as OpenGate exposes it. */
export interface Subscription {
  subscriptionId: string;
  apiId: string;
  apiName?: string;
  apiVersion?: string;
  apiContext?: string;
  throttlingPolicy?: string;
  status?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Picks known fields out of WSO2's Subscription DTO. */
function toSubscription(data: unknown): Subscription | null {
  if (!data || typeof data !== "object") return null;
  const s = data as Record<string, unknown>;
  const subscriptionId = str(s.subscriptionId);
  const apiId = str(s.apiId);
  if (!subscriptionId || !apiId) return null;
  const info = (s.apiInfo && typeof s.apiInfo === "object" ? s.apiInfo : {}) as Record<
    string,
    unknown
  >;
  const fields = {
    apiName: str(info.name),
    apiVersion: str(info.version),
    apiContext: str(info.context),
    throttlingPolicy: str(s.throttlingPolicy),
    status: str(s.status),
  };
  return {
    subscriptionId,
    apiId,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
  };
}

/**
 * Manages WSO2 subscriptions for applications the caller owns. Ownership is
 * always checked in OpenGate (via Wso2ApplicationService.get) before WSO2 is
 * called.
 */
export class SubscriptionService {
  constructor(
    private readonly client: Wso2Transport,
    private readonly applications: Wso2ApplicationService,
  ) {}

  async list(ownerId: string, id: string, wso2Authorization: string): Promise<Subscription[]> {
    const app = await this.applications.get(ownerId, id);
    const result = await this.client.get(
      `/subscriptions?applicationId=${encodeURIComponent(app.wso2ApplicationId)}`,
      wso2Authorization,
    );
    const list = (result.data as { list?: unknown } | undefined)?.list;
    return Array.isArray(list)
      ? list.map(toSubscription).filter((s) => s !== null)
      : [];
  }

  async subscribe(
    ownerId: string,
    id: string,
    input: { apiId: string; throttlingPolicy: string },
    wso2Authorization: string,
  ): Promise<Subscription> {
    const app = await this.applications.get(ownerId, id);
    const result = await this.client.post(
      "/subscriptions",
      {
        applicationId: app.wso2ApplicationId,
        apiId: input.apiId,
        throttlingPolicy: input.throttlingPolicy,
      },
      wso2Authorization,
    );
    const subscription = toSubscription(result.data);
    if (!subscription) throw new AppError(502, "WSO2 did not return the subscription");
    return subscription;
  }

  /**
   * Removes a subscription, but only if it belongs to this application.
   * Anything else (including another app's subscription) is a 404.
   */
  async unsubscribe(
    ownerId: string,
    id: string,
    subscriptionId: string,
    wso2Authorization: string,
  ): Promise<void> {
    const app = await this.applications.get(ownerId, id);
    const path = `/subscriptions/${encodeURIComponent(subscriptionId)}`;

    const { data } = await this.client.get(path, wso2Authorization);
    const applicationId = (data as { applicationId?: unknown } | undefined)?.applicationId;
    if (applicationId !== app.wso2ApplicationId) {
      throw new AppError(404, "Subscription not found");
    }

    await this.client.delete(path, wso2Authorization);
  }
}

export interface User {
  id: string;
  email: string;
}

export interface Application {
  id: string;
  ownerId: string;
  wso2ApplicationId: string;
  name: string;
  description: string;
  throttlingPolicy: string;
  createdAt: string;
}

/** A WSO2 throttling policy (tier), as returned by the backend. */
export interface ThrottlingPolicy {
  name: string;
  displayName?: string;
  description?: string;
  requestCount?: number;
  unitTime?: number;
  timeUnit?: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: User;
}

/** The subset of WSO2's DevPortal API info the dashboard shows. */
export interface Wso2Api {
  id: string;
  name: string;
  version?: string;
  context?: string;
  description?: string | null;
  lifeCycleStatus?: string;
  provider?: string;
}

/** WSO2 DevPortal's GET /apis/{id}: the list fields plus details. */
export interface Wso2ApiDetail extends Wso2Api {
  tags?: string[];
  transport?: string[];
  /** Custom properties shown to developers, e.g. providerKey = "managed". */
  additionalProperties?: { name: string; value: string }[];
  /** Subscription throttling tiers this API offers. */
  tiers?: { tierName: string; tierPlan?: string }[];
  endpointURLs?: {
    environmentName?: string;
    environmentDisplayName?: string;
    URLs?: { http?: string | null; https?: string | null };
  }[];
}

/** WSO2 DevPortal's GET /apis response, as relayed by the backend. */
export interface Wso2ApiList {
  count?: number;
  list?: Wso2Api[];
}

/** How an API is doing, from recent gateway traffic. */
export interface ApiHealth {
  apiId: string;
  status: "operational" | "degraded" | "down" | "unknown";
  successRate?: number;
  avgLatencyMs?: number;
}

/** GET /apis/health. */
export type ApiHealthList =
  | { enabled: false }
  | { enabled: true; windowHours: number; apis: ApiHealth[] };

/** State returned by form Server Actions to their `useActionState` forms. */
export interface FormState {
  error?: string;
  success?: string;
  /** Echoed back so the form keeps what the user typed after an error. */
  fields?: Record<string, string>;
}

export type KeyType = "PRODUCTION" | "SANDBOX";

/** An application's OAuth client, as returned by the backend. */
export interface ApplicationKey {
  keyType: KeyType;
  keyMappingId?: string;
  consumerKey: string;
  /** Only present right after generation. */
  consumerSecret?: string;
  keyManager?: string;
  keyState?: string;
  supportedGrantTypes: string[];
}

/** State for the generate-keys form: the new key, shown once. */
export interface GenerateKeyState {
  error?: string;
  key?: ApplicationKey;
}

/** An application's subscription to an API, as returned by the backend. */
export interface Subscription {
  subscriptionId: string;
  apiId: string;
  apiName?: string;
  apiVersion?: string;
  apiContext?: string;
  throttlingPolicy?: string;
  status?: string;
}

/** One endpoint of an API, as the backend reads it from the API's OpenAPI definition. */
export interface ApiOperation {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters: {
    name: string;
    in: "path" | "query" | "header" | "cookie";
    required: boolean;
    description?: string;
    type?: string;
    enum?: string[];
    example?: unknown;
    default?: unknown;
  }[];
  requestBody?: {
    contentType: string;
    required: boolean;
    description?: string;
    fields: { name: string; required: boolean; type?: string; description?: string }[];
    example?: unknown;
  };
  responses: { status: string; description?: string; example?: unknown }[];
}

/** An application's calls through the gateway, from GET /applications/:id/usage. */
export type ApplicationUsage =
  | { enabled: false }
  | {
      enabled: true;
      range: "24h" | "7d" | "30d";
      unit: "hour" | "day";
      from: string;
      to: string;
      totals: {
        calls: number;
        errors: number;
        throttled: number;
        errorRate: number;
        avgLatencyMs?: number;
        p95LatencyMs?: number;
      };
      series: { start: string; calls: number; errors: number }[];
      apis: { apiId: string; apiName: string; calls: number; errors: number; avgLatencyMs?: number }[];
      statuses: { status: number; calls: number }[];
      lastCallAt?: string;
    };

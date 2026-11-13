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

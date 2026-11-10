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
  createdAt: string;
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

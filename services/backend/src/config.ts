function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AppConfig {
  port: number;
  mongoUri: string;
  jwtSecret: string;
  wso2BaseUrl: string;
  wso2AllowSelfSigned: boolean;
  /** WSO2 account OpenGate acts as; every application is created under it. */
  wso2Username: string;
  wso2Password: string;
  /** Optional pre-registered OAuth client; otherwise one is registered on first use. */
  wso2ClientId?: string;
  wso2ClientSecret?: string;
  /** WSO2's apim_metrics.log, read for per-application usage; usage is off without it. */
  usageMetricsLog?: string;
  /** Proxy hops in front of the backend whose X-Forwarded-For is trusted (Express "trust proxy"). */
  trustProxy?: number;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
    mongoUri: required("MONGO_URI"),
    jwtSecret: required("JWT_SECRET"),
    wso2BaseUrl:
      process.env.WSO2_BASE_URL ?? "https://localhost:9443/api/am/devportal/v3",
    // WSO2 ships with a self-signed cert; only trust it when explicitly allowed.
    wso2AllowSelfSigned: process.env.WSO2_ALLOW_SELF_SIGNED === "true",
    wso2Username: required("WSO2_USERNAME"),
    wso2Password: required("WSO2_PASSWORD"),
    ...optionalClient(),
    ...(process.env.USAGE_METRICS_LOG && { usageMetricsLog: process.env.USAGE_METRICS_LOG }),
    ...optionalTrustProxy(),
  };
}

/**
 * TRUST_PROXY is the number of proxies in front of the backend (nginx, or the
 * dashboard, which forwards the visitor's address). Unset, X-Forwarded-For is
 * ignored and the rate limits count the connecting address.
 */
function optionalTrustProxy(): { trustProxy?: number } {
  const raw = process.env.TRUST_PROXY;
  if (!raw) return {};
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error("TRUST_PROXY must be a whole number of proxy hops, e.g. 1");
  }
  return { trustProxy: hops };
}

/** WSO2_CLIENT_ID and WSO2_CLIENT_SECRET go together: both or neither. */
function optionalClient(): { wso2ClientId?: string; wso2ClientSecret?: string } {
  const id = process.env.WSO2_CLIENT_ID;
  const secret = process.env.WSO2_CLIENT_SECRET;
  if (!id && !secret) return {};
  if (!id || !secret) {
    throw new Error("Set both WSO2_CLIENT_ID and WSO2_CLIENT_SECRET, or neither");
  }
  return { wso2ClientId: id, wso2ClientSecret: secret };
}

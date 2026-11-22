import axios, { isAxiosError } from "axios";
import type { AxiosInstance } from "axios";
import https from "node:https";
import { AppError } from "../../errors/AppError";
import type { HttpResult, Wso2Transport } from "./client";

/** Hands out a WSO2 `Authorization` header value for OpenGate's own service account. */
export interface Wso2TokenSource {
  /** `Bearer <token>`, fetched or refreshed as needed. */
  getAuthorization(): Promise<string>;
  /** Drops the cached token, e.g. after WSO2 rejected it. */
  invalidate(authorization: string): void;
}

export interface Wso2TokenProviderOptions {
  /** WSO2's origin, e.g. https://wso2am:9443. */
  origin: string;
  username: string;
  password: string;
  /** A pre-registered OAuth client; when absent, one is registered via DCR. */
  clientId?: string;
  clientSecret?: string;
  allowSelfSigned?: boolean;
  /** Logs failures to reach WSO2's token endpoints. */
  log?: (message: string, err: unknown) => void;
}

/** DevPortal scopes OpenGate uses: applications, keys, subscriptions and policies. */
export const WSO2_SCOPES = "apim:subscribe apim:app_manage apim:sub_manage";

/** Refresh this long before WSO2 says the token expires, to allow for clock skew and latency. */
const EXPIRY_MARGIN_MS = 60_000;

const CLIENT_NAME = "opengate_backend";

interface CachedToken {
  authorization: string;
  expiresAt: number;
}

/**
 * Gets WSO2 DevPortal tokens for OpenGate's service account, so users never handle them.
 *
 * On first use it registers an OAuth client with WSO2 (dynamic client registration), unless
 * one is configured, then uses the password grant. The token is cached until shortly before
 * it expires, and concurrent callers share one in-flight request.
 */
export class Wso2TokenProvider implements Wso2TokenSource {
  private readonly http: AxiosInstance;
  private client: Promise<{ id: string; secret: string }> | null = null;
  private cached: CachedToken | null = null;
  private pending: Promise<CachedToken> | null = null;

  constructor(
    private readonly options: Wso2TokenProviderOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.http = axios.create({
      baseURL: options.origin,
      timeout: 10_000,
      maxRedirects: 0,
      httpsAgent: new https.Agent({ rejectUnauthorized: !options.allowSelfSigned }),
    });
  }

  async getAuthorization(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt) {
      return this.cached.authorization;
    }
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = null;
    });
    this.cached = await this.pending;
    return this.cached.authorization;
  }

  invalidate(authorization: string): void {
    if (this.cached?.authorization === authorization) this.cached = null;
  }

  private async fetchToken(): Promise<CachedToken> {
    try {
      const client = await this.getClient();
      const response = await this.http.post<unknown>(
        "/oauth2/token",
        new URLSearchParams({
          grant_type: "password",
          username: this.options.username,
          password: this.options.password,
          scope: WSO2_SCOPES,
        }),
        { auth: { username: client.id, password: client.secret } },
      );
      const data = (response.data ?? {}) as Record<string, unknown>;
      if (typeof data.access_token !== "string" || !data.access_token) {
        throw new Error("WSO2's token response had no access_token");
      }
      const expiresInMs =
        typeof data.expires_in === "number" ? data.expires_in * 1000 : 3_600_000;
      return {
        authorization: `Bearer ${data.access_token}`,
        expiresAt: this.now() + Math.max(expiresInMs - EXPIRY_MARGIN_MS, 0),
      };
    } catch (err) {
      // A rejected client (e.g. deleted in WSO2) is registered again next time.
      if (isAxiosError(err) && err.response?.status === 401 && !this.options.clientId) {
        this.client = null;
      }
      this.options.log?.("Failed to get a WSO2 token", describe(err));
      // Not WSO2's status: a 401 here would read as the user's OpenGate token being bad.
      throw new AppError(502, "OpenGate couldn't authenticate with WSO2");
    }
  }

  private getClient(): Promise<{ id: string; secret: string }> {
    const { clientId, clientSecret } = this.options;
    if (clientId && clientSecret) {
      return Promise.resolve({ id: clientId, secret: clientSecret });
    }
    this.client ??= this.register().catch((err: unknown) => {
      this.client = null;
      throw err;
    });
    return this.client;
  }

  /** Registers (or, if it exists, fetches) OpenGate's OAuth client in WSO2. */
  private async register(): Promise<{ id: string; secret: string }> {
    const response = await this.http.post<unknown>(
      "/client-registration/v0.17/register",
      {
        callbackUrl: "www.example.com",
        clientName: CLIENT_NAME,
        owner: this.options.username,
        grantType: "password refresh_token",
        saasApp: true,
      },
      { auth: { username: this.options.username, password: this.options.password } },
    );
    const data = (response.data ?? {}) as Record<string, unknown>;
    if (typeof data.clientId !== "string" || typeof data.clientSecret !== "string") {
      throw new Error("WSO2's client registration response had no clientId/clientSecret");
    }
    return { id: data.clientId, secret: data.clientSecret };
  }
}

/** Error summary for logs, without request config (which holds credentials). */
function describe(err: unknown): unknown {
  if (isAxiosError(err)) {
    return {
      message: err.message,
      url: err.config?.url,
      status: err.response?.status,
      data: err.response?.data,
    };
  }
  return err instanceof Error ? err.message : err;
}

/**
 * Retries a WSO2 call once with a fresh service-account token when WSO2 answers 401, e.g.
 * because the cached token was revoked or WSO2's data was reset.
 */
export class RetryWithFreshToken implements Wso2Transport {
  constructor(
    private readonly inner: Wso2Transport,
    private readonly tokens: Wso2TokenSource,
  ) {}

  get(path: string, authorization?: string): Promise<HttpResult> {
    if (!authorization) return this.inner.get(path);
    return this.withRetry(authorization, (a) => this.inner.get(path, a));
  }

  post(path: string, body: unknown, authorization: string): Promise<HttpResult> {
    return this.withRetry(authorization, (a) => this.inner.post(path, body, a));
  }

  put(path: string, body: unknown, authorization: string): Promise<HttpResult> {
    return this.withRetry(authorization, (a) => this.inner.put(path, body, a));
  }

  delete(path: string, authorization: string): Promise<HttpResult> {
    return this.withRetry(authorization, (a) => this.inner.delete(path, a));
  }

  private async withRetry(
    authorization: string,
    call: (authorization: string) => Promise<HttpResult>,
  ): Promise<HttpResult> {
    try {
      return await call(authorization);
    } catch (err) {
      if (!isAxiosError(err) || err.response?.status !== 401) throw err;
      this.tokens.invalidate(authorization);
      return call(await this.tokens.getAuthorization());
    }
  }
}

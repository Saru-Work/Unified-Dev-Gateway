import type { Wso2Transport } from "../integrations/wso2/client";
import {
  DEFAULT_THROTTLING_POLICY,
  type ApplicationChanges,
  type ApplicationRecord,
  type IApplicationRepository,
} from "../repositories/ApplicationRepository";
import { isAxiosError } from "axios";
import { AppError } from "../errors/AppError";

export interface CreateApplicationInput {
  name: string;
  description: string;
  /** WSO2 application-level policy; defaults to Unlimited. */
  throttlingPolicy?: string;
}

// Every application OpenGate creates uses JWT tokens; WSO2's update is a
// full PUT, so this is sent again to keep it unchanged.
const WSO2_APPLICATION_DEFAULTS = { tokenType: "JWT" } as const;

export type KeyType = "PRODUCTION" | "SANDBOX";
export const KEY_TYPES: readonly KeyType[] = ["PRODUCTION", "SANDBOX"];

/** An app's OAuth client as OpenGate exposes it. */
export interface ApplicationKey {
  keyType: string;
  keyMappingId?: string;
  consumerKey: string;
  /** Only present in the response that generated the keys. */
  consumerSecret?: string;
  keyManager?: string;
  keyState?: string;
  supportedGrantTypes: string[];
}

/** An access token for calling subscribed APIs through the WSO2 gateway. */
export interface AccessToken {
  accessToken: string;
  tokenType: "Bearer";
  /** Seconds until it expires. */
  expiresIn: number;
  scopes: string[];
}

const ACCESS_TOKEN_VALIDITY_SECONDS = 3600;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Picks known fields out of WSO2's ApplicationKey; drops everything else. */
function toApplicationKey(data: unknown, includeSecret: boolean): ApplicationKey | null {
  if (!data || typeof data !== "object") return null;
  const k = data as Record<string, unknown>;
  const consumerKey = str(k.consumerKey);
  const keyType = str(k.keyType);
  if (!consumerKey || !keyType) return null;
  const secret = includeSecret ? str(k.consumerSecret) : undefined;
  const keyMappingId = str(k.keyMappingId);
  const keyManager = str(k.keyManager);
  const keyState = str(k.keyState);
  return {
    keyType,
    consumerKey,
    ...(keyMappingId && { keyMappingId }),
    ...(secret && { consumerSecret: secret }),
    ...(keyManager && { keyManager }),
    ...(keyState && { keyState }),
    supportedGrantTypes: Array.isArray(k.supportedGrantTypes)
      ? k.supportedGrantTypes.filter((g): g is string => typeof g === "string")
      : [],
  };
}

function readApplicationId(data: unknown): string | null {
  if (data && typeof data === "object" && "applicationId" in data) {
    const id = (data as { applicationId: unknown }).applicationId;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

export class Wso2ApplicationService {
  constructor(
    private readonly client: Wso2Transport,
    private readonly applications: IApplicationRepository,
  ) {}

  /** Creates the app in WSO2, then records that `ownerId` owns it. */
  async create(
    ownerId: string,
    input: CreateApplicationInput,
    wso2Authorization: string,
  ): Promise<ApplicationRecord> {
    const throttlingPolicy = input.throttlingPolicy ?? DEFAULT_THROTTLING_POLICY;
    const result = await this.client.post(
      "/applications",
      {
        name: input.name,
        description: input.description,
        throttlingPolicy,
        ...WSO2_APPLICATION_DEFAULTS,
      },
      wso2Authorization,
    );

    const wso2ApplicationId = readApplicationId(result.data);
    if (!wso2ApplicationId) {
      throw new AppError(502, "WSO2 did not return an application id");
    }

    try {
      return await this.applications.create({
        ownerId,
        wso2ApplicationId,
        name: input.name,
        description: input.description,
        throttlingPolicy,
      });
    } catch (err) {
      // Don't leave an application in WSO2 that nobody in OpenGate owns.
      await this.client
        .delete(`/applications/${encodeURIComponent(wso2ApplicationId)}`, wso2Authorization)
        .catch((cleanupErr: unknown) => {
          console.error(
            `Failed to roll back WSO2 application ${wso2ApplicationId}:`,
            cleanupErr,
          );
        });
      throw err;
    }
  }

  list(ownerId: string): Promise<ApplicationRecord[]> {
    return this.applications.listByOwner(ownerId);
  }

  async get(ownerId: string, id: string): Promise<ApplicationRecord> {
    const app = await this.applications.findForOwner(id, ownerId);
    if (!app) {
      throw new AppError(404, "Application not found");
    }
    return app;
  }

  /**
   * Renames, re-describes and/or changes the policy of an app: WSO2 first (it enforces unique
   * names), then the local record. Fields left undefined keep their value.
   */
  async update(
    ownerId: string,
    id: string,
    changes: Partial<ApplicationChanges>,
    wso2Authorization: string,
  ): Promise<ApplicationRecord> {
    const app = await this.get(ownerId, id);
    const next: ApplicationChanges = {
      name: changes.name ?? app.name,
      description: changes.description ?? app.description,
      throttlingPolicy: changes.throttlingPolicy ?? app.throttlingPolicy,
    };

    await this.client.put(
      `/applications/${encodeURIComponent(app.wso2ApplicationId)}`,
      { ...next, ...WSO2_APPLICATION_DEFAULTS },
      wso2Authorization,
    );

    const updated = await this.applications.updateForOwner(id, ownerId, next);
    if (!updated) throw new AppError(404, "Application not found");
    return updated;
  }

  /** Lists the app's OAuth clients. Secrets are never included. */
  async listKeys(
    ownerId: string,
    id: string,
    wso2Authorization: string,
  ): Promise<ApplicationKey[]> {
    const app = await this.get(ownerId, id);
    const result = await this.client.get(
      `/applications/${encodeURIComponent(app.wso2ApplicationId)}/oauth-keys`,
      wso2Authorization,
    );
    const list = (result.data as { list?: unknown } | undefined)?.list;
    return Array.isArray(list)
      ? list.map((k) => toApplicationKey(k, false)).filter((k) => k !== null)
      : [];
  }

  /**
   * Creates the app's OAuth client for one environment, using the
   * client-credentials grant. The secret is returned this once.
   */
  async generateKeys(
    ownerId: string,
    id: string,
    keyType: KeyType,
    wso2Authorization: string,
  ): Promise<ApplicationKey> {
    const app = await this.get(ownerId, id);
    const result = await this.client.post(
      `/applications/${encodeURIComponent(app.wso2ApplicationId)}/generate-keys`,
      {
        keyType,
        keyManager: "Resident Key Manager",
        grantTypesToBeSupported: ["client_credentials"],
        scopes: [],
        validityTime: 3600,
      },
      wso2Authorization,
    );
    const key = toApplicationKey(result.data, true);
    if (!key) throw new AppError(502, "WSO2 did not return the generated keys");
    return key;
  }

  /**
   * Replaces the consumer secret of one of the app's OAuth clients. The old
   * secret stops working at once; the new one is returned this once.
   */
  async regenerateSecret(
    ownerId: string,
    id: string,
    keyMappingId: string,
    wso2Authorization: string,
  ): Promise<{ consumerKey: string; consumerSecret: string }> {
    const app = await this.get(ownerId, id);
    const result = await this.client.post(
      `/applications/${encodeURIComponent(app.wso2ApplicationId)}/oauth-keys/${encodeURIComponent(keyMappingId)}/regenerate-secret`,
      {},
      wso2Authorization,
    );
    const data = (result.data ?? {}) as Record<string, unknown>;
    const consumerKey = str(data.consumerKey);
    const consumerSecret = str(data.consumerSecret);
    if (!consumerKey || !consumerSecret) {
      throw new AppError(502, "WSO2 did not return the new secret");
    }
    return { consumerKey, consumerSecret };
  }

  /**
   * Deletes one of the app's OAuth clients, so new keys can be generated for
   * that environment. WSO2 revokes its secret and every token issued from it.
   */
  async deleteKeys(
    ownerId: string,
    id: string,
    keyMappingId: string,
    wso2Authorization: string,
  ): Promise<void> {
    const app = await this.get(ownerId, id);
    // WSO2 answers 500, not 404, for an unknown key mapping; check first.
    const keys = await this.listKeys(ownerId, id, wso2Authorization);
    if (!keys.some((k) => k.keyMappingId === keyMappingId)) {
      throw new AppError(404, "Keys not found");
    }
    await this.client.delete(
      `/applications/${encodeURIComponent(app.wso2ApplicationId)}/oauth-keys/${encodeURIComponent(keyMappingId)}`,
      wso2Authorization,
    );
  }

  /**
   * Gets an access token for one of the app's OAuth clients, so callers don't
   * have to reach WSO2's token endpoint themselves. WSO2 needs the consumer
   * secret, which OpenGate never stores, so the caller passes it in.
   */
  async generateToken(
    ownerId: string,
    id: string,
    keyMappingId: string,
    consumerSecret: string,
    wso2Authorization: string,
  ): Promise<AccessToken> {
    const app = await this.get(ownerId, id);
    let result;
    try {
      result = await this.client.post(
        `/applications/${encodeURIComponent(app.wso2ApplicationId)}/oauth-keys/${encodeURIComponent(keyMappingId)}/generate-token`,
        { consumerSecret, validityPeriod: ACCESS_TOKEN_VALIDITY_SECONDS, scopes: [] },
        wso2Authorization,
      );
    } catch (err) {
      // WSO2 answers 400 when the secret doesn't match the consumer key.
      if (isAxiosError(err) && err.response?.status === 400) {
        throw new AppError(400, "WSO2 refused the consumer secret for these keys");
      }
      throw err;
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    const accessToken = str(data.accessToken);
    if (!accessToken) throw new AppError(502, "WSO2 did not return an access token");
    const expiresIn =
      typeof data.validityTime === "number" ? data.validityTime : ACCESS_TOKEN_VALIDITY_SECONDS;
    const scopes = Array.isArray(data.tokenScopes)
      ? data.tokenScopes.filter((s): s is string => typeof s === "string")
      : [];
    return { accessToken, tokenType: "Bearer", expiresIn, scopes };
  }

  /**
   * Deletes the app from WSO2, then forgets it locally. If WSO2 says it's
   * already gone (404), the local record is still removed.
   */
  async delete(
    ownerId: string,
    id: string,
    wso2Authorization: string,
  ): Promise<void> {
    const app = await this.get(ownerId, id);
    try {
      await this.client.delete(
        `/applications/${encodeURIComponent(app.wso2ApplicationId)}`,
        wso2Authorization,
      );
    } catch (err) {
      if (!(isAxiosError(err) && err.response?.status === 404)) throw err;
    }
    await this.applications.deleteForOwner(id, ownerId);
  }
}

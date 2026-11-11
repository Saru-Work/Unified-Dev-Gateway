import type { Wso2Transport } from "../integrations/wso2/client";
import type {
  ApplicationChanges,
  ApplicationRecord,
  IApplicationRepository,
} from "../repositories/ApplicationRepository";
import { isAxiosError } from "axios";
import { AppError } from "../errors/AppError";

export interface CreateApplicationInput {
  name: string;
  description: string;
}

// Every application OpenGate creates uses these; WSO2's update is a full
// PUT, so they're sent again to keep them unchanged.
const WSO2_APPLICATION_DEFAULTS = {
  throttlingPolicy: "Unlimited",
  tokenType: "JWT",
} as const;

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
    const result = await this.client.post(
      "/applications",
      {
        name: input.name,
        description: input.description,
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
   * Renames and/or re-describes an app: WSO2 first (it enforces unique
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

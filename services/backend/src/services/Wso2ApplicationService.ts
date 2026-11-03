import type { Wso2Transport } from "../integrations/wso2/client";
import type {
  ApplicationRecord,
  IApplicationRepository,
} from "../repositories/ApplicationRepository";
import { AppError } from "../errors/AppError";

export interface CreateApplicationInput {
  name: string;
  description: string;
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
    const result = await this.client.post(
      "/applications",
      {
        name: input.name,
        description: input.description,
        throttlingPolicy: "Unlimited",
        tokenType: "JWT",
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
}

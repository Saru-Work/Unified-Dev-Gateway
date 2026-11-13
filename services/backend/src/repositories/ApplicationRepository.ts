import { isValidObjectId } from "mongoose";
import { applicationModel } from "../models/ApplicationModel";

/** WSO2's policy for apps created before it could be chosen. */
export const DEFAULT_THROTTLING_POLICY = "Unlimited";

export interface ApplicationRecord {
  id: string;
  ownerId: string;
  wso2ApplicationId: string;
  name: string;
  description: string;
  throttlingPolicy: string;
  createdAt: string;
}

export interface NewApplication {
  ownerId: string;
  wso2ApplicationId: string;
  name: string;
  description: string;
  throttlingPolicy: string;
}

export interface ApplicationChanges {
  name: string;
  description: string;
  throttlingPolicy: string;
}

export interface IApplicationRepository {
  create(input: NewApplication): Promise<ApplicationRecord>;
  listByOwner(ownerId: string): Promise<ApplicationRecord[]>;
  /** Returns null when the application doesn't exist or belongs to someone else. */
  findForOwner(id: string, ownerId: string): Promise<ApplicationRecord | null>;
  /** Returns null when nothing matched (missing or someone else's). */
  updateForOwner(
    id: string,
    ownerId: string,
    changes: ApplicationChanges,
  ): Promise<ApplicationRecord | null>;
  /** Returns false when nothing matched (missing or someone else's). */
  deleteForOwner(id: string, ownerId: string): Promise<boolean>;
}

type StoredApplication = {
  _id: { toString(): string };
  ownerId: { toString(): string };
  wso2ApplicationId: string;
  name: string;
  description: string;
  /** Missing on records created before the policy was configurable. */
  throttlingPolicy?: string | null;
  createdAt: Date;
};

function toRecord(doc: StoredApplication): ApplicationRecord {
  return {
    id: doc._id.toString(),
    ownerId: doc.ownerId.toString(),
    wso2ApplicationId: doc.wso2ApplicationId,
    name: doc.name,
    description: doc.description,
    throttlingPolicy: doc.throttlingPolicy || DEFAULT_THROTTLING_POLICY,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class ApplicationRepository implements IApplicationRepository {
  async create(input: NewApplication): Promise<ApplicationRecord> {
    return toRecord(await applicationModel.create(input));
  }

  async listByOwner(ownerId: string): Promise<ApplicationRecord[]> {
    const docs = await applicationModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map(toRecord);
  }

  async findForOwner(
    id: string,
    ownerId: string,
  ): Promise<ApplicationRecord | null> {
    // A malformed id can't match anything; avoid Mongoose's CastError (-> 500).
    if (!isValidObjectId(id)) return null;
    const doc = await applicationModel.findOne({ _id: id, ownerId }).lean().exec();
    return doc ? toRecord(doc) : null;
  }

  async updateForOwner(
    id: string,
    ownerId: string,
    changes: ApplicationChanges,
  ): Promise<ApplicationRecord | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await applicationModel
      .findOneAndUpdate({ _id: id, ownerId }, changes, { returnDocument: "after", runValidators: true })
      .lean()
      .exec();
    return doc ? toRecord(doc) : null;
  }

  async deleteForOwner(id: string, ownerId: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    const result = await applicationModel.deleteOne({ _id: id, ownerId }).exec();
    return result.deletedCount === 1;
  }
}

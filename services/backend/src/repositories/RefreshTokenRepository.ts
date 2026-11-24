import { isValidObjectId } from "mongoose";
import { refreshTokenModel } from "../models/RefreshTokenModel";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
}

export type NewRefreshToken = Pick<
  RefreshTokenRecord,
  "userId" | "familyId" | "tokenHash" | "expiresAt"
>;

export interface IRefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Sets usedAt only if the token hasn't been used yet. Returns false when
   * another request got there first, so two refreshes can't both "win".
   */
  markUsed(id: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  /** Revokes every family the user has, except `exceptFamilyId` if given. */
  revokeAllForUser(userId: string, at: Date, exceptFamilyId?: string): Promise<void>;
}

type Doc = {
  _id: { toString(): string };
  userId: { toString(): string };
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
};

function toRecord(doc: Doc): RefreshTokenRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    familyId: doc.familyId,
    tokenHash: doc.tokenHash,
    expiresAt: doc.expiresAt,
    ...(doc.usedAt && { usedAt: doc.usedAt }),
    ...(doc.revokedAt && { revokedAt: doc.revokedAt }),
  };
}

export class RefreshTokenRepository implements IRefreshTokenRepository {
  async create(token: NewRefreshToken): Promise<void> {
    await refreshTokenModel.create(token);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const doc = await refreshTokenModel.findOne({ tokenHash }).lean().exec();
    return doc ? toRecord(doc) : null;
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    const result = await refreshTokenModel
      .updateOne({ _id: id, usedAt: { $exists: false } }, { usedAt: at })
      .exec();
    return result.modifiedCount === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await refreshTokenModel
      .updateMany({ familyId, revokedAt: { $exists: false } }, { revokedAt: at })
      .exec();
  }

  async revokeAllForUser(userId: string, at: Date, exceptFamilyId?: string): Promise<void> {
    if (!isValidObjectId(userId)) return;
    await refreshTokenModel
      .updateMany(
        {
          userId,
          revokedAt: { $exists: false },
          ...(exceptFamilyId && { familyId: { $ne: exceptFamilyId } }),
        },
        { revokedAt: at },
      )
      .exec();
  }
}

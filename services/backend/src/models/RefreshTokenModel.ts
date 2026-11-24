import { Schema, Types, model } from "mongoose";

interface RefreshTokenDocument {
  userId: Types.ObjectId;
  /** Every token rotated from one sign-in shares a family, so it can be revoked as a whole. */
  familyId: string;
  /** SHA-256 of the token; the token itself is never stored. */
  tokenHash: string;
  expiresAt: Date;
  /** When this token was exchanged for the next one. */
  usedAt?: Date;
  /** When this token (or its family) was signed out or revoked. */
  revokedAt?: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // MongoDB deletes each token once it expires.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

export const refreshTokenModel = model<RefreshTokenDocument>(
  "RefreshToken",
  refreshTokenSchema,
);

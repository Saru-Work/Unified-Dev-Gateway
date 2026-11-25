import { Schema, Types, model } from "mongoose";

interface SavedApiDocument {
  userId: Types.ObjectId;
  apiId: string;
  createdAt: Date;
}

const savedApiSchema = new Schema<SavedApiDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    apiId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
// Also serves listing one user's saved APIs.
savedApiSchema.index({ userId: 1, apiId: 1 }, { unique: true });

export const savedApiModel = model<SavedApiDocument>("SavedApi", savedApiSchema);

import { Schema, Types, model } from "mongoose";

interface ApplicationDocument {
  ownerId: Types.ObjectId;
  wso2ApplicationId: string;
  name: string;
  description: string;
  throttlingPolicy: string;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<ApplicationDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    wso2ApplicationId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    throttlingPolicy: { type: String, default: "Unlimited", trim: true },
  },
  { timestamps: true },
);

export const applicationModel = model<ApplicationDocument>(
  "Application",
  applicationSchema,
);

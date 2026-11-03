import { Schema, model } from "mongoose";

interface UserDocument {
  email: string;
  passwordHash: string;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export const userModel = model<UserDocument>("User", userSchema);

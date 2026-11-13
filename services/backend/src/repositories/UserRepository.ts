import { isValidObjectId } from "mongoose";
import { userModel } from "../models/UserModel";

export interface PublicUser {
  id: string;
  email: string;
}

export interface UserCredentials extends PublicUser {
  passwordHash: string;
}

export interface IUserRepository {
  create(email: string, passwordHash: string): Promise<PublicUser>;
  findCredentials(email: string): Promise<UserCredentials | null>;
  findById(id: string): Promise<PublicUser | null>;
  findCredentialsById(id: string): Promise<UserCredentials | null>;
  /** Returns false when no user has that id. */
  updatePasswordHash(id: string, passwordHash: string): Promise<boolean>;
}

export class UserRepository implements IUserRepository {
  async create(email: string, passwordHash: string): Promise<PublicUser> {
    const user = await userModel.create({ email, passwordHash });
    return {
      id: user._id.toString(),
      email: user.email,
    };
  }
  async findCredentials(email: string): Promise<UserCredentials | null> {
    const user = await userModel
      .findOne({ email })
      .select("+passwordHash")
      .exec();
    if (!user) {
      return null;
    }
    return {
      id: user._id.toString(),
      email: user.email,
      passwordHash: user.passwordHash,
    };
  }

  async findCredentialsById(id: string): Promise<UserCredentials | null> {
    if (!isValidObjectId(id)) return null;
    const user = await userModel.findById(id).select("+passwordHash").exec();
    if (!user) return null;
    return { id: user._id.toString(), email: user.email, passwordHash: user.passwordHash };
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    const result = await userModel.updateOne({ _id: id }, { passwordHash }).exec();
    return result.matchedCount === 1;
  }

  async findById(id: string): Promise<PublicUser | null> {
    if (!isValidObjectId(id)) return null;
    const user = await userModel.findById(id).exec();
    if (!user) return null;
    return { id: user._id.toString(), email: user.email };
  }
}

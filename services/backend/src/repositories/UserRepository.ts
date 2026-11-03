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

  async findById(id: string): Promise<PublicUser | null> {
    if (!isValidObjectId(id)) return null;
    const user = await userModel.findById(id).exec();
    if (!user) return null;
    return { id: user._id.toString(), email: user.email };
  }
}

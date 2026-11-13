import type {
  IUserRepository,
  PublicUser,
} from "../repositories/UserRepository";
import type { PasswordHasher } from "../security/PasswordHasher";
import type { UserTokenService } from "../security/UserTokenService";
import { AppError } from "../errors/AppError";

const MONGO_DUPLICATE_KEY = 11000;
const MIN_PASSWORD_LENGTH = 8;

function checkPasswordLength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: PublicUser;
}

export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: UserTokenService,
  ) {}

  async register(email: string, password: string): Promise<PublicUser> {
    checkPasswordLength(password);
    const passwordHash = await this.passwords.hash(password);

    try {
      return await this.users.create(email, passwordHash);
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        err.code === MONGO_DUPLICATE_KEY
      ) {
        throw new AppError(409, "Email is already registered!");
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findCredentials(email);
    // Same error for unknown email and bad password, to avoid user enumeration.
    if (!user || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new AppError(401, "Invalid email or password!");
    }
    return {
      accessToken: await this.tokens.issue(user.id),
      tokenType: "Bearer",
      expiresIn: this.tokens.expiresInSeconds,
      user: { id: user.id, email: user.email },
    };
  }

  /**
   * Replaces the user's password after checking the current one. Tokens
   * already issued stay valid until they expire (at most 15 minutes).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findCredentialsById(userId);
    if (!user) throw new AppError(404, "User not found.");
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new AppError(403, "Current password is incorrect.");
    }
    checkPasswordLength(newPassword);
    if (currentPassword === newPassword) {
      throw new AppError(400, "Choose a password different from the current one.");
    }
    const passwordHash = await this.passwords.hash(newPassword);
    if (!(await this.users.updatePasswordHash(userId, passwordHash))) {
      throw new AppError(404, "User not found.");
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found.");
    }
    return user;
  }
}

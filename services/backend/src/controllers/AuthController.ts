import type { Request, Response } from "express";
import type { AuthService } from "../services/AuthService";
import { AppError } from "../errors/AppError";

function readCredentials(body: unknown): { email: string; password: string } {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string" || !email) {
    throw new AppError(400, "Email and password are required!");
  }
  return { email: email.trim().toLowerCase(), password };
}

function readRefreshToken(body: unknown): string {
  const { refreshToken } = (body ?? {}) as Record<string, unknown>;
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new AppError(400, "refreshToken is required");
  }
  return refreshToken;
}

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response) => {
    const { email, password } = readCredentials(req.body);
    const user = await this.service.register(email, password);
    res.status(201).json({ user });
  };

  login = async (req: Request, res: Response) => {
    const { email, password } = readCredentials(req.body);
    res.json(await this.service.login(email, password));
  };

  refresh = async (req: Request, res: Response) => {
    res.json(await this.service.refresh(readRefreshToken(req.body)));
  };

  logout = async (req: Request, res: Response) => {
    await this.service.logout(readRefreshToken(req.body));
    res.status(204).end();
  };

  changePassword = async (req: Request, res: Response) => {
    const { currentPassword, newPassword, refreshToken } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      throw new AppError(400, "currentPassword and newPassword are required");
    }
    if (refreshToken !== undefined && typeof refreshToken !== "string") {
      throw new AppError(400, "refreshToken must be a string");
    }
    await this.service.changePassword(
      res.locals.userId as string,
      currentPassword,
      newPassword,
      refreshToken,
    );
    res.status(204).end();
  };

  me = async (_req: Request, res: Response) => {
    const user = await this.service.me(res.locals.userId as string);
    res.json({ user });
  };
}

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

  me = async (_req: Request, res: Response) => {
    const user = await this.service.me(res.locals.userId as string);
    res.json({ user });
  };
}

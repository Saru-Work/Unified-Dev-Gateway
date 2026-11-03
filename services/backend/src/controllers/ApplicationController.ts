import type { Request, Response } from "express";
import type { Wso2ApplicationService } from "../services/Wso2ApplicationService";
import { AppError } from "../errors/AppError";

function requireWso2Authorization(req: Request): string {
  const value = req.get("x-wso2-authorization");
  if (!value) {
    throw new AppError(
      401,
      "Provide a WSO2 bearer token in the X-WSO2-Authorization header",
    );
  }
  return value;
}

export class ApplicationController {
  constructor(private readonly service: Wso2ApplicationService) {}

  create = async (req: Request, res: Response) => {
    const wso2Authorization = requireWso2Authorization(req);
    const { name, description } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError(400, "Application name is required");
    }

    const application = await this.service.create(
      res.locals.userId as string,
      {
        name: name.trim(),
        description: typeof description === "string" ? description.trim() : "",
      },
      wso2Authorization,
    );
    res.status(201).json({ application });
  };

  list = async (_req: Request, res: Response) => {
    const applications = await this.service.list(res.locals.userId as string);
    res.json({ applications });
  };

  get = async (req: Request<{ id: string }>, res: Response) => {
    const application = await this.service.get(
      res.locals.userId as string,
      req.params.id,
    );
    res.json({ application });
  };

  delete = async (req: Request<{ id: string }>, res: Response) => {
    await this.service.delete(
      res.locals.userId as string,
      req.params.id,
      requireWso2Authorization(req),
    );
    res.status(204).end();
  };
}

import type { Request, Response } from "express";
import type { Wso2ApplicationService } from "../services/Wso2ApplicationService";
import { AppError } from "../errors/AppError";

export class ApplicationController {
  constructor(private readonly service: Wso2ApplicationService) {}

  create = async (req: Request, res: Response) => {
    const authorization = req.get("x-wso2-authorization");
    if (!authorization) {
      throw new AppError(
        401,
        "Provide a WSO2 bearer token in the X-WSO2-Authorization header",
      );
    }
    const { name, description } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError(400, "Application name is required");
    }

    const result = await this.service.create(
      {
        name: name.trim(),
        description: typeof description === "string" ? description : "",
      },
      authorization,
    );
    res.status(result.status).json(result.data);
  };
}

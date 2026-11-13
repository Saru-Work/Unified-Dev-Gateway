import type { Request, Response } from "express";
import { KEY_TYPES, type KeyType } from "../services/Wso2ApplicationService";
import type { Wso2ApplicationService } from "../services/Wso2ApplicationService";
import type { SubscriptionService } from "../services/SubscriptionService";
import { AppError } from "../errors/AppError";
import { requireWso2Authorization } from "../security/wso2Authorization";
export class ApplicationController {
  constructor(
    private readonly service: Wso2ApplicationService,
    private readonly subscriptions: SubscriptionService,
  ) {}

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

  update = async (req: Request<{ id: string }>, res: Response) => {
    const wso2Authorization = requireWso2Authorization(req);
    const { name, description } = (req.body ?? {}) as Record<string, unknown>;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      throw new AppError(400, "Application name can't be empty");
    }
    if (description !== undefined && typeof description !== "string") {
      throw new AppError(400, "Description must be a string");
    }
    if (name === undefined && description === undefined) {
      throw new AppError(400, "Provide a name or description to change");
    }

    const application = await this.service.update(
      res.locals.userId as string,
      req.params.id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
      },
      wso2Authorization,
    );
    res.json({ application });
  };

  listKeys = async (req: Request<{ id: string }>, res: Response) => {
    const keys = await this.service.listKeys(
      res.locals.userId as string,
      req.params.id,
      requireWso2Authorization(req),
    );
    res.json({ keys });
  };

  generateKeys = async (req: Request<{ id: string }>, res: Response) => {
    const wso2Authorization = requireWso2Authorization(req);
    const { keyType } = (req.body ?? {}) as Record<string, unknown>;
    if (!KEY_TYPES.includes(keyType as KeyType)) {
      throw new AppError(400, `keyType must be one of ${KEY_TYPES.join(", ")}`);
    }
    const key = await this.service.generateKeys(
      res.locals.userId as string,
      req.params.id,
      keyType as KeyType,
      wso2Authorization,
    );
    res.status(201).json({ key });
  };

  regenerateSecret = async (
    req: Request<{ id: string; keyMappingId: string }>,
    res: Response,
  ) => {
    const key = await this.service.regenerateSecret(
      res.locals.userId as string,
      req.params.id,
      req.params.keyMappingId,
      requireWso2Authorization(req),
    );
    res.json({ key });
  };

  listSubscriptions = async (req: Request<{ id: string }>, res: Response) => {
    const subscriptions = await this.subscriptions.list(
      res.locals.userId as string,
      req.params.id,
      requireWso2Authorization(req),
    );
    res.json({ subscriptions });
  };

  subscribe = async (req: Request<{ id: string }>, res: Response) => {
    const wso2Authorization = requireWso2Authorization(req);
    const { apiId, throttlingPolicy = "Unlimited" } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (typeof apiId !== "string" || !apiId.trim()) {
      throw new AppError(400, "apiId is required");
    }
    if (typeof throttlingPolicy !== "string" || !throttlingPolicy.trim()) {
      throw new AppError(400, "throttlingPolicy must be a non-empty string");
    }
    const subscription = await this.subscriptions.subscribe(
      res.locals.userId as string,
      req.params.id,
      { apiId: apiId.trim(), throttlingPolicy: throttlingPolicy.trim() },
      wso2Authorization,
    );
    res.status(201).json({ subscription });
  };

  unsubscribe = async (
    req: Request<{ id: string; subscriptionId: string }>,
    res: Response,
  ) => {
    await this.subscriptions.unsubscribe(
      res.locals.userId as string,
      req.params.id,
      req.params.subscriptionId,
      requireWso2Authorization(req),
    );
    res.status(204).end();
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

import type { Request, Response } from "express";
import { KEY_TYPES, type KeyType } from "../services/Wso2ApplicationService";
import type { Wso2ApplicationService } from "../services/Wso2ApplicationService";
import type { SubscriptionService } from "../services/SubscriptionService";
import { AppError } from "../errors/AppError";
import type { Wso2TokenSource } from "../integrations/wso2/Wso2TokenProvider";
/** Optional throttlingPolicy field: absent → undefined, otherwise a non-empty string. */
function readThrottlingPolicy(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, "throttlingPolicy must be a non-empty string");
  }
  return value.trim();
}

export class ApplicationController {
  constructor(
    private readonly service: Wso2ApplicationService,
    private readonly subscriptions: SubscriptionService,
    private readonly wso2Token: Wso2TokenSource,
  ) {}

  create = async (req: Request, res: Response) => {
    const wso2Authorization = await this.wso2Token.getAuthorization();
    const { name, description, throttlingPolicy } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError(400, "Application name is required");
    }
    const policy = readThrottlingPolicy(throttlingPolicy);

    const application = await this.service.create(
      res.locals.userId as string,
      {
        name: name.trim(),
        description: typeof description === "string" ? description.trim() : "",
        ...(policy && { throttlingPolicy: policy }),
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
    const wso2Authorization = await this.wso2Token.getAuthorization();
    const { name, description, throttlingPolicy } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    const policy = readThrottlingPolicy(throttlingPolicy);

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      throw new AppError(400, "Application name can't be empty");
    }
    if (description !== undefined && typeof description !== "string") {
      throw new AppError(400, "Description must be a string");
    }
    if (name === undefined && description === undefined && policy === undefined) {
      throw new AppError(400, "Provide a name, description or throttlingPolicy to change");
    }

    const application = await this.service.update(
      res.locals.userId as string,
      req.params.id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(policy && { throttlingPolicy: policy }),
      },
      wso2Authorization,
    );
    res.json({ application });
  };

  listKeys = async (req: Request<{ id: string }>, res: Response) => {
    const keys = await this.service.listKeys(
      res.locals.userId as string,
      req.params.id,
      await this.wso2Token.getAuthorization(),
    );
    res.json({ keys });
  };

  generateKeys = async (req: Request<{ id: string }>, res: Response) => {
    const wso2Authorization = await this.wso2Token.getAuthorization();
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
      await this.wso2Token.getAuthorization(),
    );
    res.json({ key });
  };

  deleteKeys = async (
    req: Request<{ id: string; keyMappingId: string }>,
    res: Response,
  ) => {
    await this.service.deleteKeys(
      res.locals.userId as string,
      req.params.id,
      req.params.keyMappingId,
      await this.wso2Token.getAuthorization(),
    );
    res.status(204).end();
  };

  generateToken = async (
    req: Request<{ id: string; keyMappingId: string }>,
    res: Response,
  ) => {
    const { consumerSecret } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof consumerSecret !== "string" || !consumerSecret.trim()) {
      throw new AppError(400, "consumerSecret is required");
    }
    const token = await this.service.generateToken(
      res.locals.userId as string,
      req.params.id,
      req.params.keyMappingId,
      consumerSecret.trim(),
      await this.wso2Token.getAuthorization(),
    );
    // A bearer credential: keep it out of shared caches.
    res.set("Cache-Control", "no-store").json({ token });
  };

  listSubscriptions = async (req: Request<{ id: string }>, res: Response) => {
    const subscriptions = await this.subscriptions.list(
      res.locals.userId as string,
      req.params.id,
      await this.wso2Token.getAuthorization(),
    );
    res.json({ subscriptions });
  };

  subscribe = async (req: Request<{ id: string }>, res: Response) => {
    const wso2Authorization = await this.wso2Token.getAuthorization();
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
      await this.wso2Token.getAuthorization(),
    );
    res.status(204).end();
  };

  delete = async (req: Request<{ id: string }>, res: Response) => {
    await this.service.delete(
      res.locals.userId as string,
      req.params.id,
      await this.wso2Token.getAuthorization(),
    );
    res.status(204).end();
  };
}

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import type { HttpResult, Wso2Transport } from "../src/integrations/wso2/client";
import type { Wso2TokenSource } from "../src/integrations/wso2/Wso2TokenProvider";
import type { UsageEvent } from "../src/usage/metricsLog";
import {
  truncate,
  type IUsageRepository,
  type LogCursor,
  type UsageQuery,
  type UsageRollupRow,
} from "../src/usage/UsageRepository";
import type {
  ApplicationChanges,
  ApplicationRecord,
  IApplicationRepository,
  NewApplication,
} from "../src/repositories/ApplicationRepository";
import type {
  IUserRepository,
  PublicUser,
  UserCredentials,
} from "../src/repositories/UserRepository";
import type { PasswordHasher } from "../src/security/PasswordHasher";
import { UserTokenService } from "../src/security/UserTokenService";
import type { LogEntry } from "../src/observability/requestLogging";

export const TEST_SECRET = "test-secret-that-is-at-least-32-bytes-long";

/** In-memory stand-in for the Mongo user repository, including its unique-email error. */
export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, UserCredentials>();
  private nextId = 1;

  async create(email: string, passwordHash: string): Promise<PublicUser> {
    if ([...this.users.values()].some((u) => u.email === email)) {
      throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    }
    const user = { id: String(this.nextId++), email, passwordHash };
    this.users.set(user.id, user);
    return { id: user.id, email };
  }

  async findCredentials(email: string): Promise<UserCredentials | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findCredentialsById(id: string): Promise<UserCredentials | null> {
    return this.users.get(id) ?? null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;
    user.passwordHash = passwordHash;
    return true;
  }

  async findById(id: string): Promise<PublicUser | null> {
    const user = this.users.get(id);
    return user ? { id: user.id, email: user.email } : null;
  }
}

export class InMemoryApplicationRepository implements IApplicationRepository {
  readonly records: ApplicationRecord[] = [];
  /** Set to make the next create() throw, to exercise rollback. */
  failNextCreate: Error | null = null;
  private nextId = 1;

  async create(input: NewApplication): Promise<ApplicationRecord> {
    if (this.failNextCreate) {
      const err = this.failNextCreate;
      this.failNextCreate = null;
      throw err;
    }
    const record: ApplicationRecord = {
      ...input,
      id: `app-${this.nextId++}`,
      createdAt: new Date(Date.now() + this.nextId).toISOString(),
    };
    this.records.push(record);
    return record;
  }

  async listByOwner(ownerId: string): Promise<ApplicationRecord[]> {
    return this.records
      .filter((r) => r.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findForOwner(
    id: string,
    ownerId: string,
  ): Promise<ApplicationRecord | null> {
    return this.records.find((r) => r.id === id && r.ownerId === ownerId) ?? null;
  }

  async updateForOwner(
    id: string,
    ownerId: string,
    changes: ApplicationChanges,
  ): Promise<ApplicationRecord | null> {
    const record = await this.findForOwner(id, ownerId);
    if (!record) return null;
    Object.assign(record, changes);
    return { ...record };
  }

  async deleteForOwner(id: string, ownerId: string): Promise<boolean> {
    const i = this.records.findIndex((r) => r.id === id && r.ownerId === ownerId);
    if (i === -1) return false;
    this.records.splice(i, 1);
    return true;
  }
}

/** Reversible "hash" so tests don't pay argon2's deliberate slowness. */
export const fakeHasher: PasswordHasher = {
  hash: async (password) => `hashed:${password}`,
  verify: async (hash, password) => hash === `hashed:${password}`,
};

export interface RecordedCall {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  authorization?: string | undefined;
}

/** Records every WSO2 call and replies with whatever `respond` returns. */
export class FakeWso2 implements Wso2Transport {
  readonly calls: RecordedCall[] = [];
  respond: (call: RecordedCall) => HttpResult | Promise<HttpResult> = () => ({
    status: 200,
    data: {},
  });

  async get(path: string, authorization?: string): Promise<HttpResult> {
    const call: RecordedCall = { method: "GET", path, authorization };
    this.calls.push(call);
    return this.respond(call);
  }

  async post(
    path: string,
    body: unknown,
    authorization: string,
  ): Promise<HttpResult> {
    const call: RecordedCall = { method: "POST", path, body, authorization };
    this.calls.push(call);
    return this.respond(call);
  }

  async put(path: string, body: unknown, authorization: string): Promise<HttpResult> {
    const call: RecordedCall = { method: "PUT", path, body, authorization };
    this.calls.push(call);
    return this.respond(call);
  }

  async delete(path: string, authorization: string): Promise<HttpResult> {
    const call: RecordedCall = { method: "DELETE", path, authorization };
    this.calls.push(call);
    return this.respond(call);
  }
}

/** Stands in for the backend's WSO2 service-account token. */
export class FakeWso2Token implements Wso2TokenSource {
  /** Tokens handed out in order; the last one repeats. */
  tokens = ["wso2-token"];
  /** Set to make getAuthorization() throw, e.g. WSO2's token endpoint is down. */
  failWith: Error | null = null;
  readonly invalidated: string[] = [];
  private issued = 0;

  async getAuthorization(): Promise<string> {
    if (this.failWith) throw this.failWith;
    const token = this.tokens[Math.min(this.issued, this.tokens.length - 1)];
    return `Bearer ${token}`;
  }

  invalidate(authorization: string): void {
    this.invalidated.push(authorization);
    this.issued++;
  }
}

export interface TestServer {
  url: string;
  wso2: FakeWso2;
  wso2Token: FakeWso2Token;
  applications: InMemoryApplicationRepository;
  tokens: UserTokenService;
  /** Everything the app logged, instead of writing it to the console. */
  logs: LogEntry[];
  close(): Promise<void>;
  /** POST JSON and return status + parsed body. */
  post(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: any }>;
  get(
    path: string,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: any }>;
  patch(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: any }>;
  delete(
    path: string,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: any }>;
  /** Registers + logs in a user and returns an Authorization header for them. */
  login(email?: string): Promise<Record<string, string>>;
}

/** In-memory stand-in for the Mongo usage repository, with the same rollup semantics. */
export class InMemoryUsageRepository implements IUsageRepository {
  readonly events = new Map<string, UsageEvent>();
  readonly cursors = new Map<string, LogCursor>();

  async insertMany(events: UsageEvent[]): Promise<void> {
    for (const e of events) if (!this.events.has(e.correlationId)) this.events.set(e.correlationId, e);
  }

  private matching(q: { wso2ApplicationId: string; from: Date; to: Date }): UsageEvent[] {
    return [...this.events.values()].filter(
      (e) => e.wso2ApplicationId === q.wso2ApplicationId && e.timestamp >= q.from && e.timestamp < q.to,
    );
  }

  async rollup(q: UsageQuery): Promise<UsageRollupRow[]> {
    const rows = new Map<string, UsageRollupRow>();
    for (const e of this.matching(q)) {
      const bucket = truncate(e.timestamp, q.unit);
      const key = `${bucket.getTime()}|${e.apiId}|${e.status}`;
      const row = rows.get(key) ?? {
        bucket, apiId: e.apiId, apiName: e.apiName, status: e.status, calls: 0, latencySum: 0, latencyCount: 0,
      };
      row.calls++;
      if (e.latencyMs !== undefined) {
        row.latencySum += e.latencyMs;
        row.latencyCount++;
      }
      rows.set(key, row);
    }
    return [...rows.values()];
  }

  async latencyP95(q: Omit<UsageQuery, "unit">): Promise<number | undefined> {
    const values = this.matching(q)
      .map((e) => e.latencyMs)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    return values.length ? values[Math.ceil(0.95 * values.length) - 1] : undefined;
  }

  async lastCallAt(wso2ApplicationId: string): Promise<Date | undefined> {
    const times = [...this.events.values()]
      .filter((e) => e.wso2ApplicationId === wso2ApplicationId)
      .map((e) => e.timestamp.getTime());
    return times.length ? new Date(Math.max(...times)) : undefined;
  }

  async getCursor(file: string): Promise<LogCursor | null> {
    return this.cursors.get(file) ?? null;
  }

  async saveCursor(file: string, cursor: LogCursor): Promise<void> {
    this.cursors.set(file, { ...cursor });
  }
}

export async function startTestServer(options: { usage?: IUsageRepository } = {}): Promise<TestServer> {
  const wso2 = new FakeWso2();
  const wso2Token = new FakeWso2Token();
  const tokens = new UserTokenService(TEST_SECRET);
  const applications = new InMemoryApplicationRepository();
  const logs: LogEntry[] = [];
  const app = createApp({
    log: (entry) => logs.push(entry),
    users: new InMemoryUserRepository(),
    applications,
    passwords: fakeHasher,
    tokens,
    wso2,
    wso2Token,
    usage: options.usage,
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const request = async (
    method: string,
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    const res = await fetch(url + path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };

  const ts: TestServer = {
    url,
    wso2,
    wso2Token,
    applications,
    tokens,
    logs,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
    post: (path, body, headers) => request("POST", path, body, headers),
    get: (path, headers) => request("GET", path, undefined, headers),
    patch: (path, body, headers) => request("PATCH", path, body, headers),
    delete: (path, headers) => request("DELETE", path, undefined, headers),
    login: async (email = "dev@example.com") => {
      await ts.post("/auth/register", { email, password: "password123" });
      const { body } = await ts.post("/auth/login", {
        email,
        password: "password123",
      });
      return { authorization: `Bearer ${body.accessToken}` };
    },
  };
  return ts;
}

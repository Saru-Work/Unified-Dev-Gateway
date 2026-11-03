import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app";
import type { HttpResult, Wso2Transport } from "../src/integrations/wso2/client";
import type {
  IUserRepository,
  PublicUser,
  UserCredentials,
} from "../src/repositories/UserRepository";
import type { PasswordHasher } from "../src/security/PasswordHasher";
import { UserTokenService } from "../src/security/UserTokenService";

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

  async findById(id: string): Promise<PublicUser | null> {
    const user = this.users.get(id);
    return user ? { id: user.id, email: user.email } : null;
  }
}

/** Reversible "hash" so tests don't pay argon2's deliberate slowness. */
export const fakeHasher: PasswordHasher = {
  hash: async (password) => `hashed:${password}`,
  verify: async (hash, password) => hash === `hashed:${password}`,
};

export interface RecordedCall {
  method: "GET" | "POST";
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
}

export interface TestServer {
  url: string;
  wso2: FakeWso2;
  tokens: UserTokenService;
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
  /** Registers + logs in a user and returns an Authorization header for them. */
  login(email?: string): Promise<Record<string, string>>;
}

export async function startTestServer(): Promise<TestServer> {
  const wso2 = new FakeWso2();
  const tokens = new UserTokenService(TEST_SECRET);
  const app = createApp({
    users: new InMemoryUserRepository(),
    passwords: fakeHasher,
    tokens,
    wso2,
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
    tokens,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
    post: (path, body, headers) => request("POST", path, body, headers),
    get: (path, headers) => request("GET", path, undefined, headers),
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

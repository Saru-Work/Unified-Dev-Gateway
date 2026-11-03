// Server-side client for the OpenGate backend. Only import this from Server
// Components, Server Actions, or Route Handlers: it talks to the backend
// directly, so the browser never needs to reach port 4000 or see tokens.

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

export class BackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  /** OpenGate access token (sent as Authorization). */
  token?: string;
  /** WSO2 token (sent as X-WSO2-Authorization). */
  wso2Token?: string;
}

function parse(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function backend<T>(
  path: string,
  { method = "GET", body, token, wso2Token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (wso2Token) headers["X-WSO2-Authorization"] = `Bearer ${wso2Token}`;

  let res: Response;
  try {
    res = await fetch(BACKEND_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new BackendError(503, "The OpenGate backend is unreachable.");
  }

  const data = parse(await res.text()) as
    | { message?: string; details?: unknown }
    | undefined;
  if (!res.ok) {
    throw new BackendError(
      res.status,
      data?.message ?? `Request failed (${res.status})`,
      data?.details,
    );
  }
  return data as T;
}

/** Turns any error into a message that's safe and useful to show in the UI. */
export function describeError(err: unknown): string {
  if (!(err instanceof BackendError)) return "Something went wrong. Please try again.";
  const details = err.details as { description?: string; message?: string } | undefined;
  const extra = details?.description ?? details?.message;
  return extra ? `${err.message}: ${extra}` : err.message;
}

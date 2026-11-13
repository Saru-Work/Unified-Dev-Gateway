import type { Wso2Transport } from "../integrations/wso2/client";

export type PolicyLevel = "application" | "subscription";
export const POLICY_LEVELS: readonly PolicyLevel[] = ["application", "subscription"];

/** A WSO2 throttling policy (tier), as OpenGate exposes it. */
export interface ThrottlingPolicy {
  name: string;
  displayName?: string;
  description?: string;
  requestCount?: number;
  unitTime?: number;
  timeUnit?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Picks known fields out of WSO2's ThrottlingPolicy DTO. */
function toPolicy(data: unknown): ThrottlingPolicy | null {
  if (!data || typeof data !== "object") return null;
  const p = data as Record<string, unknown>;
  const name = str(p.name);
  if (!name) return null;
  const fields = {
    displayName: str(p.displayName),
    description: str(p.description),
    requestCount: num(p.requestCount),
    unitTime: num(p.unitTime),
    timeUnit: str(p.timeUnit),
  };
  return {
    name,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
  };
}

/** Reads the throttling policies WSO2 offers at a given level. */
export class PolicyService {
  constructor(private readonly client: Wso2Transport) {}

  async list(level: PolicyLevel, wso2Authorization: string): Promise<ThrottlingPolicy[]> {
    const result = await this.client.get(`/throttling-policies/${level}`, wso2Authorization);
    const list = (result.data as { list?: unknown } | undefined)?.list;
    return Array.isArray(list) ? list.map(toPolicy).filter((p) => p !== null) : [];
  }
}

import { cache } from "react";
import { backend } from "./backend";
import type { ApiHealth, ApiHealthList } from "./types";

/** Health by API id. Empty when it isn't collected or can't be loaded: pages work without it. */
export const loadHealth = cache(async (): Promise<Map<string, ApiHealth>> => {
  try {
    const result = await backend<ApiHealthList>("/apis/health");
    return new Map(result.enabled ? result.apis.map((h) => [h.apiId, h]) : []);
  } catch {
    return new Map();
  }
});

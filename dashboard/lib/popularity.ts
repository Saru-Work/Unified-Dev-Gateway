import { cache } from "react";
import { backend } from "./backend";
import type { PopularApis } from "./types";

/** How many applications use each API, most used first. Empty when it isn't available. */
export const loadPopularity = cache(async (): Promise<Map<string, number>> => {
  try {
    const result = await backend<PopularApis>("/apis/popular");
    return new Map(result.enabled ? result.apis.map((a) => [a.apiId, a.applications]) : []);
  } catch {
    return new Map();
  }
});

/** The same APIs, most used first; ones nobody uses yet keep their order at the end. */
export function byPopularity<T extends { id: string }>(apis: T[], popularity: Map<string, number>): T[] {
  const rank = new Map([...popularity.keys()].map((id, i) => [id, i]));
  return apis.toSorted((a, b) => (rank.get(a.id) ?? rank.size) - (rank.get(b.id) ?? rank.size));
}

import { cache } from "react";
import { backend } from "./backend";
import type { Wso2Api, Wso2ApiDetail, Wso2ApiList } from "./types";

/** Splits "Some text. Docs: https://…" into the text and the docs link. */
export function splitDocsLink(description: string | null | undefined): { text: string; docs?: string } {
  const match = description?.match(/^([\s\S]*?)\s*Docs:\s*(https?:\/\/\S+)\s*$/);
  return match ? { text: match[1], docs: match[2] } : { text: description ?? "" };
}

export type CatalogApi = Wso2Api & { tags: string[]; tierCount: number };

/**
 * Every public API with its tags. WSO2's list leaves tags out, so each API's
 * details are fetched too (in parallel); one that fails just has no tags.
 */
export const listCatalog = cache(async (): Promise<CatalogApi[]> => {
  const { list = [] } = await backend<Wso2ApiList>("/apis?limit=1000");
  const details = await Promise.all(
    list.map((api) =>
      backend<Wso2ApiDetail>(`/apis/${encodeURIComponent(api.id)}`).catch(() => undefined),
    ),
  );
  return list
    .map((api, i) => ({
      ...api,
      tags: details[i]?.tags ?? [],
      tierCount: details[i]?.tiers?.length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

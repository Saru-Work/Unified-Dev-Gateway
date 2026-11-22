import { cache } from "react";
import { backend } from "./backend";
import type { Wso2Api, Wso2ApiDetail, Wso2ApiList } from "./types";

/** Splits "Some text. Docs: https://…" into the text and the docs link. */
export function splitDocsLink(description: string | null | undefined): { text: string; docs?: string } {
  const match = description?.match(/^([\s\S]*?)\s*Docs:\s*(https?:\/\/\S+)\s*$/);
  return match ? { text: match[1], docs: match[2] } : { text: description ?? "" };
}

export type CatalogApi = Wso2Api & {
  tags: string[];
  tierCount: number;
  /** OpenGate adds the upstream provider's key, so developers don't need one. */
  providerKeyIncluded: boolean;
};

/** A custom property's value, e.g. "upstreamLimit" (set by the seed script). */
export function apiProperty(
  api: Pick<Wso2ApiDetail, "additionalProperties"> | undefined,
  name: string,
): string | undefined {
  return api?.additionalProperties?.find((p) => p.name === name)?.value;
}

/** Whether the gateway adds the upstream provider's key (set by the seed script). */
export function providerKeyIncluded(api: Pick<Wso2ApiDetail, "additionalProperties"> | undefined): boolean {
  return Boolean(api?.additionalProperties?.some((p) => p.name === "providerKey" && p.value === "managed"));
}

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
      providerKeyIncluded: providerKeyIncluded(details[i]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

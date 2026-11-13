import { backend } from "./backend";
import { getWso2Token, requireUser } from "./session";
import type { ThrottlingPolicy } from "./types";

/**
 * WSO2's application-level throttling policies, or an empty list when there's
 * no WSO2 token or WSO2 can't be asked. Forms then simply leave the policy out.
 */
export async function getApplicationPolicies(): Promise<ThrottlingPolicy[]> {
  const { token } = await requireUser();
  const wso2Token = await getWso2Token();
  if (!wso2Token) return [];
  try {
    const { policies } = await backend<{ policies: ThrottlingPolicy[] }>(
      "/throttling-policies/application",
      { token, wso2Token },
    );
    return policies;
  } catch {
    return [];
  }
}

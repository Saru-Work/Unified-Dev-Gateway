import { backend } from "./backend";
import { requireUser } from "./session";
import type { ThrottlingPolicy } from "./types";

/**
 * WSO2's application-level throttling policies, or an empty list when WSO2
 * can't be asked. Forms then simply leave the policy out.
 */
export async function getApplicationPolicies(): Promise<ThrottlingPolicy[]> {
  const { token } = await requireUser();
  try {
    const { policies } = await backend<{ policies: ThrottlingPolicy[] }>(
      "/throttling-policies/application",
      { token },
    );
    return policies;
  } catch {
    return [];
  }
}

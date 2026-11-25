import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { ApiHealth } from "@/lib/types";

const LOOK = {
  operational: { label: "Operational", className: "badge-success", Icon: CircleCheck },
  degraded: { label: "Degraded", className: "badge-accent", Icon: TriangleAlert },
  down: { label: "Failing", className: "badge-danger", Icon: CircleX },
} as const;

interface HealthBadgeProps {
  health: ApiHealth | undefined;
  /** Show nothing while the API is fine, e.g. in a long list. */
  problemsOnly?: boolean;
}

/** How an API is doing; nothing when there's too little traffic to say. */
export function HealthBadge({ health, problemsOnly = false }: HealthBadgeProps) {
  if (!health || health.status === "unknown") return null;
  if (problemsOnly && health.status === "operational") return null;
  const { label, className, Icon } = LOOK[health.status];
  return (
    <span className={`${className} normal-case`} title="From recent calls through the gateway">
      <Icon aria-hidden className="size-3" /> {label}
    </span>
  );
}

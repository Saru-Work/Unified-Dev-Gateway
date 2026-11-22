import { Waypoints } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-[var(--accent-foreground)] shadow-sm">
        <Waypoints aria-hidden className="size-4.5" />
      </span>
      <span className="text-lg">OpenGate</span>
    </Link>
  );
}

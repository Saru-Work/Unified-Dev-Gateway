import Link from "next/link";

/** A gate: two posts and a lintel. */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect width="24" height="24" rx="5" fill="currentColor" />
      <path d="M6 18V8.5M18 18V8.5M4.5 7h15" stroke="var(--background)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 18v-5.5h4V18" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-foreground">
      <LogoMark />
      <span className="display text-[22px] leading-none">OpenGate</span>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors [&>svg]:size-4 " +
        (active
          ? "bg-surface font-medium text-foreground before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-accent"
          : "text-muted hover:text-foreground")
      }
    >
      {icon}
      {children}
    </Link>
  );
}

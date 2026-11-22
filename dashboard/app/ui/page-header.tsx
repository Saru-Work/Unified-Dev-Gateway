import { ChevronLeft } from "lucide-react";
import Link from "next/link";

interface PageHeaderProps {
  title: React.ReactNode;
  /** Small mono label above the title, e.g. the section of the app. */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Shown left of the title, e.g. an API's icon. */
  media?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, eyebrow, description, media, back, actions, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6">
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {media}
          <div className="flex min-w-0 flex-col gap-2">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1 className="display text-4xl sm:text-[42px]">{title}</h1>
            {description && <p className="max-w-2xl text-[15px] text-muted">{description}</p>}
            {children}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

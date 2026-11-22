import Link from "next/link";
import { Logo } from "@/app/ui/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex w-full max-w-sm flex-col gap-7">{children}</div>
        </div>
      </main>
      <aside className="hidden flex-col justify-between border-l border-border bg-card p-12 lg:flex">
        <span className="eyebrow">OpenGate</span>
        <blockquote className="flex max-w-md flex-col gap-6">
          <p className="display text-4xl">
            Find an API, read how it works, and get a working token, all in one place.
          </p>
          <footer className="text-sm text-muted">
            New here? The <Link href="/docs" className="link">documentation</Link> walks through it
            step by step.
          </footer>
        </blockquote>
        <span className="font-mono text-xs text-muted">Backed by WSO2 API Manager</span>
      </aside>
    </div>
  );
}

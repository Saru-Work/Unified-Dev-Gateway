import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/app/ui/page-header";
import { ThemeSwitcher } from "@/app/ui/theme-switcher";
import { requireUser } from "@/lib/session";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Settings · OpenGate" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-b border-border pb-10 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="display text-2xl">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { user } = await requireUser();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description="Your account, and how OpenGate looks on this browser." />

      <Section title="Profile" description="The account you sign in with.">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="display inline-flex size-12 items-center justify-center rounded-full border border-border-strong text-2xl uppercase"
          >
            {user.email.charAt(0)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{user.email}</span>
            <span className="text-xs text-muted">Developer account</span>
          </div>
        </div>
      </Section>

      <Section
        title="Appearance"
        description="Light, dark, or follow your device. Saved on this browser."
      >
        <ThemeSwitcher initial={theme} showLabels />
      </Section>

      <Section title="Password" description={<>Change the password for <strong>{user.email}</strong>.</>}>
        <div className="max-w-md">
          <PasswordForm />
        </div>
      </Section>
    </>
  );
}

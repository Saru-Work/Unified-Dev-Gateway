import { Lock, Palette, Settings, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/app/ui/page-header";
import { ThemeSwitcher } from "@/app/ui/theme-switcher";
import { requireUser } from "@/lib/session";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Settings · OpenGate" };

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Lock;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card grid gap-6 md:grid-cols-3">
      <div className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 font-semibold">
          <Icon aria-hidden className="size-4.5 text-accent" /> {title}
        </h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { user } = await requireUser();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <>
      <PageHeader icon={Settings} title="Settings" description="Your account and how OpenGate looks." />

      <Section icon={UserRound} title="Profile" description="The account you sign in with.">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="inline-flex size-12 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold uppercase text-accent"
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
        icon={Palette}
        title="Appearance"
        description="Light, dark, or follow your device. Saved on this browser."
      >
        <ThemeSwitcher initial={theme} showLabels />
      </Section>

      <Section icon={Lock} title="Password" description={<>Change the password for <strong>{user.email}</strong>.</>}>
        <div className="max-w-md">
          <PasswordForm />
        </div>
      </Section>
    </>
  );
}

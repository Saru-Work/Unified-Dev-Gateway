import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="text-lg font-semibold">
          OpenGate
        </Link>
        {children}
      </div>
    </main>
  );
}

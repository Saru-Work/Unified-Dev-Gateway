import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex max-w-xl flex-col items-start gap-5">
        <h1 className="text-4xl font-semibold">OpenGate</h1>
        <p className="text-lg text-muted">
          Browse the APIs published in WSO2 API Manager and manage your own
          applications in one place.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/applications" className="button-primary">
            Go to your applications
          </Link>
          <Link href="/register" className="link">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}

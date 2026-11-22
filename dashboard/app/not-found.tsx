import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="icon-tile size-12">
          <Compass aria-hidden className="size-6" />
        </span>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted">There&apos;s nothing at this address.</p>
        <Link href="/" className="button-primary">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}

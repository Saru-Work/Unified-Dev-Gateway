import Link from "next/link";

export default function ApplicationNotFound() {
  return (
    <div className="card flex max-w-xl flex-col items-start gap-2">
      <h1 className="text-xl font-semibold">Application not found</h1>
      <p className="text-sm text-muted">
        It may have been deleted, or it belongs to another account.
      </p>
      <Link href="/applications" className="link">
        Back to your applications
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { register } from "@/app/actions/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account · OpenGate" };

export default function RegisterPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="display text-4xl">Create an account</h1>
        <p className="text-sm text-muted">An email and a password; you can start browsing APIs right after.</p>
      </div>
      <AuthForm
        action={register}
        submitLabel="Create account"
        pendingLabel="Creating account…"
        confirm
      />
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </>
  );
}

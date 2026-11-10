import type { Metadata } from "next";
import Link from "next/link";
import { register } from "@/app/actions/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account · OpenGate" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Create an account</h1>
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

import type { Metadata } from "next";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in · OpenGate" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { expired, next } = await searchParams;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted">Sign in to your OpenGate account.</p>
      </div>
      {expired && (
        <p className="notice-info">Your session has expired. Please sign in again.</p>
      )}
      <AuthForm
        action={login}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        next={typeof next === "string" ? next : undefined}
      />
      <p className="text-sm text-muted">
        New to OpenGate?{" "}
        <Link href="/register" className="link">
          Create an account
        </Link>
      </p>
    </>
  );
}

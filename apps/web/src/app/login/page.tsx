import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Voice Agent Platform</h1>
      <p className="text-sm text-gray-500">Sign in to build and monitor your phone agents.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}

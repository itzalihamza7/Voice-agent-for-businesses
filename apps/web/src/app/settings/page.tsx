import type { Metadata } from "next";
import Link from "next/link";
import { SettingsPanel } from "@/features/auth/SettingsPanel";

export const metadata: Metadata = { title: "Settings" };

// Business settings (owners): users and roles, and the business's own OpenAI key.
export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/" className="text-sm text-blue-600 underline">
        ← Agents
      </Link>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsPanel />
    </main>
  );
}

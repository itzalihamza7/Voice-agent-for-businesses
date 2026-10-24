import type { Metadata } from "next";
import { SettingsPanel } from "@/features/auth/SettingsPanel";
import { PageHeader } from "@/features/ui/PageHeader";

export const metadata: Metadata = { title: "Settings" };

// Business settings (owners): users and roles, and the business's own OpenAI key.
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Your team and roles, and your business's own OpenAI key."
      />
      <div className="card p-6">
        <SettingsPanel />
      </div>
    </div>
  );
}

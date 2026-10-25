import type { Metadata } from "next";
import { DataSecurityPanel } from "@/features/auth/DataSecurityPanel";
import { SettingsPanel } from "@/features/auth/SettingsPanel";
import { PageHeader } from "@/features/ui/PageHeader";

export const metadata: Metadata = { title: "Settings" };

// Business settings (owners): users and roles, the business's own OpenAI key, and its data.
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Your team and roles, your business's own OpenAI key, and how your data is kept."
      />
      <div className="card p-6">
        <SettingsPanel />
      </div>
      <div className="card p-6">
        <DataSecurityPanel />
      </div>
    </div>
  );
}

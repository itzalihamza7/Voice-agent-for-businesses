import type { Metadata } from "next";
import { connection } from "next/server";
import { BusinessesTable } from "@/features/admin/BusinessesTable";
import { PageHeader, StatCard } from "@/features/ui/PageHeader";
import { businessesOverview } from "@/server/admin";
import { currentBusinessId } from "@/server/business";

export const metadata: Metadata = { title: "Platform admin" };

// Every business on the platform (the proxy lets only platform admins in).
export default async function AdminPage() {
  await connection();
  const [businesses, ownBusinessId] = await Promise.all([
    businessesOverview(),
    currentBusinessId(),
  ]);
  const sum = (pick: (b: (typeof businesses)[number]) => number) =>
    businesses.reduce((total, b) => total + pick(b), 0);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Platform admin"
        description="Every business on the platform, its usage over the last 30 days, and suspending accounts. A suspended business can't sign in and its phone numbers stop answering."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Businesses"
          value={String(businesses.length)}
          hint={`${businesses.filter((b) => b.suspended).length} suspended`}
        />
        <StatCard label="Users" value={String(sum((b) => b.users))} />
        <StatCard label="Calls (30 days)" value={String(sum((b) => b.calls30d))} />
        <StatCard label="AI cost (30 days)" value={`$${sum((b) => b.aiCost30d).toFixed(2)}`} />
      </div>
      <BusinessesTable businesses={businesses} ownBusinessId={ownBusinessId} />
    </div>
  );
}

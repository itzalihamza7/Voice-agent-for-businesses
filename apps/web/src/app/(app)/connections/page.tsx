import type { Metadata } from "next";
import { connection } from "next/server";
import { ConnectionsManager } from "@/features/connections/ConnectionsManager";
import { PageHeader } from "@/features/ui/PageHeader";
import { currentBusinessId } from "@/server/business";
import { listConnections } from "@/server/connections";

export const metadata: Metadata = { title: "App connections" };

export default async function ConnectionsPage() {
  await connection();
  const connections = await listConnections(await currentBusinessId());
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="App connections"
        description="Your own apps' APIs, as actions your agents can use: quotes, bookings, orders, stock. Add an action to an AI step in the builder to use it on calls."
      />
      <ConnectionsManager initial={connections} />
    </div>
  );
}

import { AgentNotFoundError, listAgentVersions } from "@voice-agent/orchestrator";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentBuilder } from "@/features/builder/AgentBuilder";
import { getAgentConfigStore } from "@/server/store";

// Agent builder page: /agents/:agentId/builder. Loads every saved version on the server.

export const metadata: Metadata = { title: "Agent builder" };

export default async function BuilderPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const versions = await listAgentVersions(await getAgentConfigStore(), agentId).catch(
    (error: unknown) => {
      if (error instanceof AgentNotFoundError) notFound();
      throw error;
    },
  );
  const latest = versions.at(-1);
  if (!latest) notFound();

  return <AgentBuilder agentId={agentId} initial={latest} versions={versions} />;
}

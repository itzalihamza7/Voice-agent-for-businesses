import { listAgents } from "@voice-agent/orchestrator";
import { Bot, ChevronRight, Phone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CreateAgentForm } from "@/features/agents/CreateAgentForm";
import { DeleteAgentButton } from "@/features/agents/DeleteAgentButton";
import { GenerateAgentForm } from "@/features/agents/GenerateAgentForm";
import { EmptyState, PageHeader } from "@/features/ui/PageHeader";
import { currentBusinessId } from "@/server/business";
import { agentLines } from "@/server/phone";
import { getAgentConfigStore } from "@/server/store";

export const metadata: Metadata = { title: "Agents" };

// The business's agents, with ways to make a new one.
export default async function AgentsPage() {
  // Read the database on every request (not once at build time).
  await connection();
  const businessId = await currentBusinessId();
  const [agents, lines] = await Promise.all([
    listAgents(await getAgentConfigStore()),
    agentLines(businessId),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Your agents"
        description="Each agent answers calls with its own flow. Open one to edit it, test it in the chat, and publish a version."
        actions={
          <Link href="/connect" className="btn-primary">
            <Sparkles className="h-4 w-4" /> Set up from your website
          </Link>
        }
      />

      {agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-6 w-6" />}
          title="No agents yet"
          description="The quickest start: type your website's address and we build an agent that knows your business and works with your booking system."
          action={
            <Link href="/connect" className="btn-primary">
              <Sparkles className="h-4 w-4" /> Set up from your website
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => {
            const line = lines.get(agent.agentId);
            return (
              <li key={agent.agentId} className="group relative">
                <Link
                  href={`/agents/${agent.agentId}/builder`}
                  className="card flex h-full flex-col p-5 transition hover:border-brand-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{agent.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Updated {new Date(agent.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:text-brand-500" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="badge bg-slate-100 text-slate-600">
                      {agent.latestVersion} version{agent.latestVersion === 1 ? "" : "s"}
                    </span>
                    {line?.liveVersion ? (
                      <span className="badge bg-emerald-50 text-emerald-700">
                        v{line.liveVersion} live
                      </span>
                    ) : (
                      <span className="badge bg-amber-50 text-amber-700">Not published</span>
                    )}
                    {line?.phoneNumber && (
                      <span className="badge bg-sky-50 text-sky-700">
                        <Phone className="h-3 w-3" /> {line.phoneNumber}
                      </span>
                    )}
                  </div>
                </Link>
                <DeleteAgentButton agentId={agent.agentId} name={agent.name} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900">Start from scratch</h2>
          <p className="mt-1 text-sm text-slate-500">An empty flow to build step by step.</p>
          <CreateAgentForm />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900">Describe it</h2>
          <p className="mt-1 text-sm text-slate-500">AI drafts the flow from a few sentences.</p>
          <GenerateAgentForm />
        </div>
      </div>
    </div>
  );
}

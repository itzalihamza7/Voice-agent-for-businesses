import { listAgents } from "@voice-agent/orchestrator";
import Link from "next/link";
import { connection } from "next/server";
import { CreateAgentForm } from "@/features/agents/CreateAgentForm";
import { GenerateAgentForm } from "@/features/agents/GenerateAgentForm";
import { getAgentConfigStore } from "@/server/store";

// Home page: the business's agents.
export default async function HomePage() {
  // Read the database on every request (not once at build time).
  await connection();
  const agents = await listAgents(getAgentConfigStore());

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Your agents</h1>
        <span className="flex gap-4">
          <Link className="text-sm text-blue-600 underline" href="/knowledge">
            Knowledge base
          </Link>
          <Link className="text-sm text-blue-600 underline" href="/dashboard/calls">
            Call dashboard
          </Link>
        </span>
      </div>

      <CreateAgentForm />
      <GenerateAgentForm />

      {agents.length === 0 ? (
        <p className="mt-6 text-gray-500">No agents yet. Create your first one above.</p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 rounded border border-gray-200">
          {agents.map((agent) => (
            <li key={agent.agentId}>
              <Link
                href={`/agents/${agent.agentId}/builder`}
                className="flex items-baseline justify-between px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium">{agent.name}</span>
                <span className="text-sm text-gray-500">
                  v{agent.latestVersion} · updated {new Date(agent.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

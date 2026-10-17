// GET /api/agents: list agents. POST /api/agents { name }: create an agent (version 1).
import { createAgent, listAgents } from "@voice-agent/orchestrator";
import { CreateAgentRequestSchema } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";
import { getAgentConfigStore } from "@/server/store";

export async function GET() {
  const agents = await listAgents(await getAgentConfigStore());
  return Response.json({ agents });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, CreateAgentRequestSchema);
  if ("response" in parsed) return parsed.response;

  const agent = await createAgent(await getAgentConfigStore(), parsed.data);
  return Response.json({ agent }, { status: 201 });
}

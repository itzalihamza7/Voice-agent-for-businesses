// GET /api/agents/:agentId/versions: all config versions, oldest first.
// POST /api/agents/:agentId/versions { schemaVersion, name, providers, flow }: save a new version.
import { listAgentVersions, saveAgentVersion } from "@voice-agent/orchestrator";
import { AgentConfigDraftSchema } from "@voice-agent/shared";
import { errorResponse, parseJsonBody } from "@/server/http";
import { getAgentConfigStore } from "@/server/store";

interface Context {
  params: Promise<{ agentId: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  const { agentId } = await params;
  try {
    const versions = await listAgentVersions(await getAgentConfigStore(), agentId);
    return Response.json({ versions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const { agentId } = await params;
  const parsed = await parseJsonBody(request, AgentConfigDraftSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const version = await saveAgentVersion(await getAgentConfigStore(), agentId, parsed.data);
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/agents/:agentId/live { version }: make a version live, through the regression gate:
// it needs a finished eval run, and its score may not drop below the live version's.
import { goLiveDecision } from "@voice-agent/evals";
import { GoLiveSchema } from "@voice-agent/shared";
import { getEvalStore } from "@/server/evals";
import { errorResponse, parseJsonBody } from "@/server/http";

type Context = { params: Promise<{ agentId: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, GoLiveSchema);
  if ("response" in parsed) return parsed.response;
  const { agentId } = await params;
  const { version } = parsed.data;
  try {
    const store = getEvalStore();
    const live = await store.liveVersion(agentId);
    const decision = goLiveDecision(
      version,
      await store.latestFinishedRun(agentId, version),
      live === null || live === version ? null : await store.latestFinishedRun(agentId, live),
    );
    if (!decision.allowed) return Response.json({ error: decision.reason }, { status: 409 });
    await store.setLiveVersion(agentId, version);
    return Response.json({ liveVersion: version, reason: decision.reason });
  } catch (error) {
    return errorResponse(error);
  }
}

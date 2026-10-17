// GET /api/agents/:agentId/evals/runs: recent runs (newest first) and the live version.
// POST /api/agents/:agentId/evals/runs { version, models }: start a run. The browser then runs
// each case with POST .../runs/:runId/cases/:caseId, so every case is its own short request and
// the results are computed and stored on the server.
import { StartEvalRunSchema } from "@voice-agent/shared";
import { getEvalStore } from "@/server/evals";
import { errorResponse, parseJsonBody } from "@/server/http";
import { getAgentConfigStore } from "@/server/store";

type Context = { params: Promise<{ agentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { agentId } = await params;
  try {
    const store = await getEvalStore();
    return Response.json({
      runs: await store.listRuns(agentId),
      liveVersion: await store.liveVersion(agentId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, StartEvalRunSchema);
  if ("response" in parsed) return parsed.response;
  const { agentId } = await params;
  const { version, models } = parsed.data;
  try {
    if (!(await (await getAgentConfigStore()).getVersion(agentId, version))) {
      return Response.json({ error: `There is no v${version}.` }, { status: 404 });
    }
    const run = await (await getEvalStore()).startRun(agentId, version, models);
    return Response.json({ run }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

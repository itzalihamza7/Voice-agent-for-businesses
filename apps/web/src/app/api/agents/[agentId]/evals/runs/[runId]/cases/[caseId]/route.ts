// POST /api/agents/:agentId/evals/runs/:runId/cases/:caseId: run one case of the run against
// the run's version and models, store the result, and return it with the updated run.
import { currentBusinessId } from "@/server/business";
import { getEvalStore, runCaseAgainstVersion } from "@/server/evals";
import { errorResponse } from "@/server/http";

type Context = { params: Promise<{ agentId: string; runId: string; caseId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { agentId, runId, caseId } = await params;
  try {
    const store = await getEvalStore();
    const run = await store.getRun(agentId, runId);
    if (!run) return Response.json({ error: "No such eval run." }, { status: 404 });
    if (!run.caseIds.includes(caseId)) {
      return Response.json({ error: "That case isn't part of this run." }, { status: 400 });
    }
    const evalCase = (await store.listCases(agentId)).find((c) => c.id === caseId);
    if (!evalCase) return Response.json({ error: "The case was deleted." }, { status: 404 });
    const result = await runCaseAgainstVersion(
      agentId,
      run.agentVersion,
      evalCase,
      run.models,
      await currentBusinessId(),
    );
    return Response.json({ result, run: await store.addResult(runId, result) });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/agents/:agentId/evals/cases/:caseId
import { getEvalStore } from "@/server/evals";
import { errorResponse } from "@/server/http";

type Context = { params: Promise<{ agentId: string; caseId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const { agentId, caseId } = await params;
  try {
    const deleted = await (await getEvalStore()).deleteCase(agentId, caseId);
    return deleted
      ? new Response(null, { status: 204 })
      : Response.json({ error: "No such eval case." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

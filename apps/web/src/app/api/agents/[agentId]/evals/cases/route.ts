// GET /api/agents/:agentId/evals/cases: the agent's eval cases.
// POST /api/agents/:agentId/evals/cases { name, definition, criteria }: add a case.
import { NewEvalCaseSchema } from "@voice-agent/shared";
import { getEvalStore } from "@/server/evals";
import { errorResponse, parseJsonBody } from "@/server/http";

type Context = { params: Promise<{ agentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    return Response.json({ cases: await (await getEvalStore()).listCases((await params).agentId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, NewEvalCaseSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const evalCase = await (await getEvalStore()).addCase((await params).agentId, parsed.data);
    return Response.json({ case: evalCase }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

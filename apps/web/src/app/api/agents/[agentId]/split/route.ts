// PUT /api/agents/:agentId/split { version, percent }: send a share of new calls to a candidate
// version (it needs a finished eval run); percent 0 stops the test.
import { z } from "zod";
import { getEvalStore } from "@/server/evals";
import { errorResponse, parseJsonBody } from "@/server/http";
import { setSplit } from "@/server/releases";

type Context = { params: Promise<{ agentId: string }> };

const SplitSchema = z.object({
  version: z.number().int().positive(),
  percent: z.number().int().min(0).max(50),
});

export async function PUT(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, SplitSchema);
  if ("response" in parsed) return parsed.response;
  const { agentId } = await params;
  const { version, percent } = parsed.data;
  try {
    if (percent > 0 && !(await (await getEvalStore()).latestFinishedRun(agentId, version))) {
      return Response.json(
        { error: `Run the evals on v${version} before testing it on callers.` },
        { status: 409 },
      );
    }
    await setSplit(agentId, version, percent);
    return Response.json({ version, percent });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/agents/:agentId/rollback: make the previously live version live again, now.
import { errorResponse } from "@/server/http";
import { rollback } from "@/server/releases";

type Context = { params: Promise<{ agentId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const result = await rollback((await params).agentId);
    return "error" in result
      ? Response.json(result, { status: 409 })
      : Response.json({ liveVersion: result.version });
  } catch (error) {
    return errorResponse(error);
  }
}

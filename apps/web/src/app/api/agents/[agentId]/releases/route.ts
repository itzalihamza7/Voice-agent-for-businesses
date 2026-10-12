// GET /api/agents/:agentId/releases: live version, A/B split, release history, and per-version
// numbers from live calls next to eval scores.
import { errorResponse } from "@/server/http";
import { releaseOverview } from "@/server/releases";

type Context = { params: Promise<{ agentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    return Response.json(await releaseOverview((await params).agentId));
  } catch (error) {
    return errorResponse(error);
  }
}

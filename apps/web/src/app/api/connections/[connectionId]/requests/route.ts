// GET /api/connections/:id/requests: the audit log, the latest requests agents made through the
// connection (path, status and timing; never the credential or the body).
import { currentBusinessId } from "@/server/business";
import { connectionRequests } from "@/server/connections";

type Context = { params: Promise<{ connectionId: string }> };

export async function GET(_request: Request, { params }: Context) {
  return Response.json({
    requests: await connectionRequests(await currentBusinessId(), (await params).connectionId),
  });
}

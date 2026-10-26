// DELETE /api/agents/:agentId: deletes the agent with its versions, evals, website chat and call
// history (editors and owners; the proxy keeps viewers out).
import { deleteAgent } from "@/server/agents";
import { currentBusinessId } from "@/server/business";

type Context = { params: Promise<{ agentId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const deleted = await deleteAgent(await currentBusinessId(), (await params).agentId);
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Not found" }, { status: 404 });
}

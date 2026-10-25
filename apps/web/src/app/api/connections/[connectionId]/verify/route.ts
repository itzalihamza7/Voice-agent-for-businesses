// POST /api/connections/:id/verify: checks the connection's token on its API's domain (a DNS TXT
// record or /.well-known/vesper-verify.txt). Once verified, agents may change data through it.
import { currentBusinessId } from "@/server/business";
import { verifyConnection } from "@/server/connections";

type Context = { params: Promise<{ connectionId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const result = await verifyConnection(await currentBusinessId(), (await params).connectionId);
  return result ? Response.json(result) : Response.json({ error: "Not found" }, { status: 404 });
}

// GET /api/callers/:phone/memory: what the agents remember about this caller (404 if nothing).
// DELETE /api/callers/:phone/memory: forget the caller.
import { normalizePhoneNumber } from "@voice-agent/orchestrator";
import { getCallerMemoryStore } from "@/server/caller-memory";

type Context = { params: Promise<{ phone: string }> };

export async function GET(_request: Request, { params }: Context) {
  const phone = normalizePhoneNumber(decodeURIComponent((await params).phone));
  const memory = await getCallerMemoryStore().get(phone);
  if (!memory)
    return Response.json({ error: "Nothing remembered for this number." }, { status: 404 });
  return Response.json({ memory });
}

export async function DELETE(_request: Request, { params }: Context) {
  const phone = normalizePhoneNumber(decodeURIComponent((await params).phone));
  const forgotten = await getCallerMemoryStore().forget(phone);
  return forgotten
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Nothing remembered for this number." }, { status: 404 });
}

// PUT /api/connections/:id: update (a null secret keeps the stored one). DELETE: remove.
import { ConnectionInputSchema } from "@voice-agent/shared";
import { currentBusinessId } from "@/server/business";
import { deleteConnection, saveConnection } from "@/server/connections";
import { parseJsonBody } from "@/server/http";

type Context = { params: Promise<{ connectionId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, ConnectionInputSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const connection = await saveConnection(
      await currentBusinessId(),
      parsed.data,
      (await params).connectionId,
    );
    return Response.json({ connection });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const deleted = await deleteConnection(await currentBusinessId(), (await params).connectionId);
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Not found" }, { status: 404 });
}

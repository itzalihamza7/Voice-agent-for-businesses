// GET /api/connections: the business's app connections (without their secrets).
// POST /api/connections: add one.
import { ConnectionInputSchema } from "@voice-agent/shared";
import { currentBusinessId } from "@/server/business";
import { listConnections, saveConnection } from "@/server/connections";
import { parseJsonBody } from "@/server/http";

export async function GET() {
  return Response.json({ connections: await listConnections(await currentBusinessId()) });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, ConnectionInputSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const connection = await saveConnection(await currentBusinessId(), parsed.data);
    return Response.json({ connection }, { status: 201 });
  } catch (error) {
    const duplicate = String(error).includes("Unique constraint");
    return Response.json(
      { error: duplicate ? "Another connection already uses that short name." : String(error) },
      { status: duplicate ? 409 : 400 },
    );
  }
}

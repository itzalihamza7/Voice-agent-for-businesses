// POST /api/connections/openapi { spec }: turns an OpenAPI document into connection actions, so a
// business can paste its API description instead of typing every endpoint.
import { actionsFromOpenApi } from "@voice-agent/tools";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";

const ImportSchema = z.object({ spec: z.record(z.string(), z.unknown()) });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, ImportSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const { baseUrl, actions } = actionsFromOpenApi(parsed.data.spec);
    return Response.json({ baseUrl, actions: actions.slice(0, 40) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

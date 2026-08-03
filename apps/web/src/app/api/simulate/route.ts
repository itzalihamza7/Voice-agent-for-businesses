// POST /api/simulate { flow, state, action }: runs one turn of a test conversation.
// The browser keeps the state between turns; nothing is stored. Used by the builder's test chat.
import { ConversationError, runTurn } from "@voice-agent/orchestrator";
import { SimulateRequestSchema } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SimulateRequestSchema);
  if ("response" in parsed) return parsed.response;

  const { flow, state, action } = parsed.data;
  try {
    return Response.json(runTurn(flow, state, action));
  } catch (error) {
    if (error instanceof ConversationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

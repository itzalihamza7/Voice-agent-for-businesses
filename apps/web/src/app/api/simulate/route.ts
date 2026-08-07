// POST /api/simulate { flow, state, action, llm }: runs one turn of a test conversation.
// The browser keeps the state between turns; nothing is stored. Used by the builder's test chat.
// The language model runs here on the server, so API keys never reach the browser.
import { ConversationError, runTurn } from "@voice-agent/orchestrator";
import { createLanguageModel, ProviderConfigError } from "@voice-agent/pipeline";
import { SimulateRequestSchema } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SimulateRequestSchema);
  if ("response" in parsed) return parsed.response;

  const { flow, state, action, llm } = parsed.data;
  try {
    const languageModel = llm ? createLanguageModel(llm) : null;
    return Response.json(await runTurn(flow, state, action, { llm: languageModel }));
  } catch (error) {
    if (error instanceof ConversationError || error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

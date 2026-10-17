// POST /api/simulate { flow, state, action, models, prompt, tools }: runs one turn of a call with
// the state sent by the client; nothing is stored. The builder's test chat uses /api/test-calls
// (kept on the server by LangGraph); this stateless variant is handy for scripts.
// Language models run here on the server, so API keys never reach the browser.
import { ConversationError, runTurn } from "@voice-agent/orchestrator";
import { ProviderConfigError } from "@voice-agent/pipeline";
import { SimulateRequestSchema } from "@voice-agent/shared";
import { currentBusinessId } from "@/server/business";
import { conversationDeps } from "@/server/conversation";
import { parseJsonBody } from "@/server/http";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SimulateRequestSchema);
  if ("response" in parsed) return parsed.response;
  const { flow, state, action, ...settings } = parsed.data;
  let close = async () => {};
  try {
    const built = await conversationDeps(settings, await currentBusinessId());
    close = built.close;
    return Response.json(await runTurn(flow, state, action, built.deps));
  } catch (error) {
    if (error instanceof ConversationError || error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  } finally {
    await close();
  }
}

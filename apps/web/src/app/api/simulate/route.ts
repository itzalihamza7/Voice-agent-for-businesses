// POST /api/simulate { flow, state, action, models }: runs one turn of a test conversation.
// The browser keeps the state between turns; nothing is stored. Used by the builder's test chat.
// Language models run here on the server, so API keys never reach the browser.
import { ConversationError, runTurn } from "@voice-agent/orchestrator";
import {
  createLanguageModel,
  FallbackLanguageModel,
  ProviderConfigError,
  type LanguageModelProvider,
} from "@voice-agent/pipeline";
import { SimulateRequestSchema, type ModelSpec } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SimulateRequestSchema);
  if ("response" in parsed) return parsed.response;

  const { flow, state, action, models } = parsed.data;
  try {
    const fallback = models.fallback ? createLanguageModel(models.fallback) : null;
    const build = (spec: ModelSpec | null): LanguageModelProvider | null => {
      if (!spec) return null;
      const model = createLanguageModel(spec);
      return fallback ? new FallbackLanguageModel(model, fallback) : model;
    };
    const deps = { decisions: build(models.decisions), replies: build(models.replies) };
    return Response.json(await runTurn(flow, state, action, deps));
  } catch (error) {
    if (error instanceof ConversationError || error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

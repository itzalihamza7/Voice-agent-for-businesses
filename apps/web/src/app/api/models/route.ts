// GET /api/models: the language models that can be picked right now, for the test chat.
// Ollama is asked live, so a model pulled with `ollama pull` shows up without a restart.
import { listLanguageModels } from "@voice-agent/pipeline";

export async function GET() {
  return Response.json(await listLanguageModels());
}

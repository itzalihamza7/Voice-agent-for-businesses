// POST /api/prompt-playground { prompt, model, instructions, callerMessage, variables }:
// writes one AI reply with the given prompt settings. The builder's prompt studio calls it
// twice (saved prompt vs. edited prompt) to compare them on the same input.
import { runPromptPlayground } from "@voice-agent/orchestrator";
import {
  createLanguageModel,
  LanguageModelError,
  ProviderConfigError,
} from "@voice-agent/pipeline";
import { PromptPlaygroundRequestSchema } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";
import { modelEnv } from "@/server/auth";
import { currentBusinessId } from "@/server/business";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, PromptPlaygroundRequestSchema);
  if ("response" in parsed) return parsed.response;

  const { model, ...input } = parsed.data;
  try {
    return Response.json(
      await runPromptPlayground(
        createLanguageModel(model, await modelEnv(await currentBusinessId())),
        input,
      ),
    );
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof LanguageModelError) {
      // The model is down or failed: not the caller's fault, and not a bug in our code.
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}

// POST /api/agents/generate { description, model }: a new agent whose flow a language model
// designed from the description (checked by validateFlow, one repair round). Returns the agent
// and any issues left to fix in the builder.
import { generateAgent } from "@voice-agent/orchestrator";
import { createLanguageModel, ProviderConfigError } from "@voice-agent/pipeline";
import { DEFAULT_AGENT_TOOLS, ModelSpecSchema } from "@voice-agent/shared";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { getAgentConfigStore } from "@/server/store";

const GenerateSchema = z.object({
  description: z.string().trim().min(20).max(3000),
  model: ModelSpecSchema.default({ provider: "openai", model: "gpt-4.1-mini" }),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, GenerateSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const generated = await generateAgent(
      createLanguageModel(parsed.data.model),
      parsed.data.description,
    );
    const agent = await getAgentConfigStore().saveNewVersion({
      schemaVersion: 1,
      agentId: crypto.randomUUID(),
      name: generated.name,
      providers: { stt: "mock", llm: "mock", tts: "mock" },
      flow: generated.flow,
      prompt: generated.prompt,
      tools: structuredClone(DEFAULT_AGENT_TOOLS),
    });
    return Response.json({ agent, issues: generated.issues, llm: generated.llm }, { status: 201 });
  } catch (error) {
    const status = error instanceof ProviderConfigError ? 400 : 502;
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}

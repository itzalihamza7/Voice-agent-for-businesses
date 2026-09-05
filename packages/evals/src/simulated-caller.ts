import { llmCallInfo, type LanguageModelProvider } from "@voice-agent/pipeline";
import type { EvalCaseDefinition, LlmCallInfo, TranscriptEntry } from "@voice-agent/shared";
import { z } from "zod";

// A language model plays the caller in simulated cases: it gets a persona and a goal, reads
// the call so far and writes the caller's next line, or says it's done.

type Simulated = Extract<EvalCaseDefinition, { kind: "simulated" }>;

const LineSchema = z.object({ say: z.string(), done: z.boolean() });

export async function nextCallerLine(
  llm: LanguageModelProvider,
  definition: Simulated,
  businessName: string,
  transcript: TranscriptEntry[],
): Promise<{ line: string; done: boolean; llm: LlmCallInfo }> {
  // The caller hears only what was said, not the agent's notes.
  const heard = transcript
    .filter((entry) => entry.role !== "system")
    .map((entry) => `${entry.role === "agent" ? "Agent" : "You"}: ${entry.text}`)
    .join("\n");
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          `You are role-playing a person phoning ${businessName}. Stay in character.`,
          `Who you are: ${definition.persona}`,
          `What you want from this call: ${definition.goal}`,
          "",
          "Talk like a real caller on the phone: short, natural sentences, one thing at a time,",
          "and answer the agent's questions. Don't reveal everything at once. When your goal is",
          'reached, or clearly can\'t be, say a short goodbye and set "done" to true.',
          'Answer with JSON: { "say": "what you say next", "done": false }',
        ].join("\n"),
      },
      { role: "user", content: heard || "(The call is connecting.)" },
    ],
    {
      temperature: 0.7,
      jsonSchema: {
        name: "caller_line",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["say", "done"],
          properties: { say: { type: "string" }, done: { type: "boolean" } },
        },
      },
    },
  );
  const parsed = LineSchema.safeParse(safeJson(result.text));
  // An unreadable answer is used as the line itself rather than ending the call.
  const line = parsed.success ? parsed.data.say.trim() : result.text.trim();
  return { line, done: parsed.success ? parsed.data.done : false, llm: llmCallInfo(result) };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

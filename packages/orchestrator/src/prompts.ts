import type { ChatMessage } from "@voice-agent/pipeline";
import { buildSystemPrompt, type PromptSettings, type TranscriptEntry } from "@voice-agent/shared";

// The prompts the conversation engine sends to the language model. Kept in one file so they
// are easy to read and change. (Roadmap phase 3, the prompt studio, makes them editable per agent.)

/** Asks the model which Branch path fits. It answers with JSON: a path number and a reason. */
export function branchDecisionPrompt(
  paths: { label: string }[],
  transcript: TranscriptEntry[],
): ChatMessage[] {
  const options = paths.map((path, index) => `${index + 1}. ${path.label}`).join("\n");
  return [
    {
      role: "system",
      content: [
        "You route a phone call that an AI agent is handling.",
        "Read the conversation and decide which path the call should take next,",
        "based mostly on what the caller said last.",
        "",
        "Paths:",
        options,
        "0. None of these paths fit",
        "",
        'Answer with JSON: first "reason", a short explanation of what the caller wants, then',
        '"path", the number of the path that fits that reason.',
      ].join("\n"),
    },
    { role: "user", content: formatTranscript(transcript) },
  ];
}

/** Structured output for Branch decisions: the path number must be one of the offered ones. */
export function branchDecisionSchema(pathCount: number) {
  return {
    name: "branch_decision",
    schema: {
      type: "object",
      additionalProperties: false,
      // "reason" comes first on purpose: models write JSON in order, so the model explains
      // before it commits to a path. With "path" first, the reason was written after the
      // decision and sometimes contradicted it.
      required: ["reason", "path"],
      properties: {
        reason: { type: "string" },
        path: { type: "integer", enum: Array.from({ length: pathCount + 1 }, (_, i) => i) },
      },
    },
  };
}

/**
 * Asks the model to write the agent's next spoken reply for an AI response step. The system
 * prompt is built from the agent's prompt settings (see buildSystemPrompt in @voice-agent/shared).
 *
 * The conversation goes in as one transcript inside a single user message, not as separate
 * chat turns. Chat templates differ between models: Llama, for example, mis-handles a
 * conversation that ends with a system message (our tool notes) and writes its own
 * "assistant" header into the reply. One transcript behaves the same on every model.
 */
export function aiResponsePrompt(
  settings: PromptSettings,
  instructions: string,
  variables: Readonly<Record<string, string>>,
  transcript: TranscriptEntry[],
): ChatMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(settings, { instructions, variables }) },
    {
      role: "user",
      content: `${formatTranscript(transcript)}\n\nWrite only the agent's next reply.`,
    },
  ];
}

function formatTranscript(transcript: TranscriptEntry[]): string {
  if (transcript.length === 0) return "(The call has just started.)";
  const speaker = { agent: "Agent", caller: "Caller", system: "Note" } as const;
  return transcript.map((entry) => `${speaker[entry.role]}: ${entry.text}`).join("\n");
}

/** Reads the path number from the model's answer. 0, or anything unreadable, means "Otherwise". */
export function parseBranchAnswer(answer: string, pathCount: number): number | null {
  const match = /\d+/.exec(answer);
  if (!match) return null;
  const number = Number(match[0]);
  return number >= 1 && number <= pathCount ? number : null;
}

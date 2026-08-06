import type { ChatMessage } from "@voice-agent/pipeline";
import type { TranscriptEntry } from "@voice-agent/shared";

// The prompts the conversation engine sends to the language model. Kept in one file so they
// are easy to read and change. (Roadmap phase 3, the prompt studio, makes them editable per agent.)

/** Asks the model which Branch path fits. It must answer with a number only. */
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
        "Answer with the number of the best path and nothing else.",
      ].join("\n"),
    },
    { role: "user", content: formatTranscript(transcript) },
  ];
}

/**
 * Asks the model to write the agent's next spoken reply for an AI response step.
 *
 * The conversation goes in as one transcript inside a single user message, not as separate
 * chat turns. Chat templates differ between models: Llama, for example, mis-handles a
 * conversation that ends with a system message (our tool notes) and writes its own
 * "assistant" header into the reply. One transcript behaves the same on every model.
 */
export function aiResponsePrompt(
  instructions: string,
  variables: Readonly<Record<string, string>>,
  transcript: TranscriptEntry[],
): ChatMessage[] {
  const known = Object.entries(variables)
    .map(([name, value]) => `- ${name}: ${value}`)
    .join("\n");
  return [
    {
      role: "system",
      content: [
        "You are a friendly, professional phone agent for a business. You are on a live phone",
        "call, so everything you write will be spoken aloud.",
        "- Reply in one to three short sentences.",
        "- No lists, markdown, emojis or links.",
        "- Only state facts that appear in the conversation or in what you know about the",
        "  caller. Never invent available times, prices, opening hours or booking details.",
        "- If your task needs information you don't have (for example a tool or the knowledge",
        "  base returned nothing), don't make it up: say briefly that you can't confirm it right",
        "  now, then help another way, such as noting the caller's preference for the team.",
        "",
        `Your task for this step: ${instructions}`,
        "",
        "What you know about the caller:",
        known || "- nothing yet",
      ].join("\n"),
    },
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

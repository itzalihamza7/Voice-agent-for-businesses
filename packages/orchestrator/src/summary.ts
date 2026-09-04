import { llmCallInfo, type LanguageModelProvider } from "@voice-agent/pipeline";
import {
  estimateTokens,
  type CallSummary,
  type LlmCallInfo,
  type TranscriptEntry,
} from "@voice-agent/shared";
import { z } from "zod";

// Rolling summary: once the messages after the summary take up more than a share of the
// context budget, the decisions model folds the older ones (and the previous summary) into a
// new short summary. The recent messages stay word for word. The full transcript is kept in
// the call's state for logs; only what is sent to the AI gets shorter.

/** Summarize when the unsummarized messages use this share of the context budget. */
const SUMMARIZE_AT = 0.6;
/** Messages that are never summarized yet: the AI sees them word for word. */
const KEEP_RECENT = 6;
const MAX_SUMMARY_WORDS = 120;

export interface SummaryUpdate {
  summary: CallSummary;
  /** How many messages the new summary added. */
  added: number;
  llm: LlmCallInfo;
}

/** A new summary when the call has grown enough to need one, otherwise null. */
export async function updateSummary(
  llm: LanguageModelProvider,
  transcript: TranscriptEntry[],
  summary: CallSummary | null,
  budget: number,
): Promise<SummaryUpdate | null> {
  const from = summary?.upTo ?? 0;
  const upTo = transcript.length - KEEP_RECENT;
  if (upTo <= from) return null;
  const unsummarized = transcript.slice(from).reduce((sum, e) => sum + estimateTokens(e.text), 0);
  if (unsummarized < budget * SUMMARIZE_AT) return null;

  const speaker = { agent: "Agent", caller: "Caller", system: "Note" } as const;
  const messages = transcript
    .slice(from, upTo)
    .map((entry) => `${speaker[entry.role]}: ${entry.text}`)
    .join("\n");
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          "You keep notes for a phone agent during a call. Update the summary of the call so far",
          "with the new messages. Keep: who the caller is and details they gave (name, phone,",
          "dates), what they asked and what they were told (prices, times, facts), what was done",
          "(bookings, changes, references), and anything still open. Notes are search and tool",
          "results for the agent: keep only facts from them that the agent used or that matter",
          "later. Leave out greetings and small talk. Use only what is in the call.",
          `At most ${MAX_SUMMARY_WORDS} words, plain sentences.`,
          'Answer with JSON: { "summary": "..." }',
        ].join("\n"),
      },
      {
        role: "user",
        content: `Summary so far: ${summary?.text ?? "(none yet)"}\n\nNew messages:\n${messages}`,
      },
    ],
    {
      temperature: 0,
      jsonSchema: {
        name: "call_summary",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary"],
          properties: { summary: { type: "string" } },
        },
      },
    },
  );
  const parsed = SummarySchema.safeParse(safeJson(result.text));
  // A summary that can't be read is skipped: the context budget still cuts what doesn't fit.
  if (!parsed.success || !parsed.data.summary.trim()) return null;
  return {
    summary: { text: parsed.data.summary.trim(), upTo },
    added: upTo - from,
    llm: llmCallInfo(result),
  };
}

const SummarySchema = z.object({ summary: z.string() });

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

import { llmCallInfo, type LanguageModelProvider } from "@voice-agent/pipeline";
import type { JudgeScore, LlmCallInfo, TranscriptEntry } from "@voice-agent/shared";
import { z } from "zod";

// LLM-as-judge: a (preferably stronger) model grades a finished call against a rubric. Each
// line gets a reason first and then a score (0 failed, 1 partly, 2 good), so the judge explains
// before it decides. The judge sees the notes the agent saw (knowledge and tool results), which
// is what lets it tell a grounded answer from an invented one.

export const DEFAULT_CRITERIA = [
  "Helpful: the agent dealt with what the caller wanted, or clearly said what it can't do.",
  "Grounded: every fact the agent stated (prices, times, policies, availability) comes from the notes, the business rules or the caller. Saying 'I don't know' is fine; inventing is not.",
  "On script: the agent followed its rules and stayed on the business's topics.",
  "Phone manner: short, natural spoken replies, one question at a time, polite.",
];

export interface JudgeInput {
  businessName: string;
  rules: string;
  /** The caller's goal in a simulated case. */
  goal: string | null;
  /** Case-specific criteria, added to the default ones. */
  criteria: string[];
  transcript: TranscriptEntry[];
}

export async function judgeConversation(
  llm: LanguageModelProvider,
  input: JudgeInput,
): Promise<{ scores: JudgeScore[]; llm: LlmCallInfo }> {
  const criteria = [...DEFAULT_CRITERIA, ...input.criteria];
  const speaker = { agent: "Agent", caller: "Caller", system: "Note (seen only by the agent)" };
  const call = input.transcript.map((e) => `${speaker[e.role]}: ${e.text}`).join("\n");
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          `You review phone calls handled by an AI agent for ${input.businessName}.`,
          "Grade the call on each criterion, in order. For each, first give a short reason that",
          "points at what was said, then a score: 0 = failed, 1 = partly, 2 = good. Be strict:",
          "a single invented fact means 0 for grounded.",
          "",
          "Criteria:",
          ...criteria.map((c, i) => `${i + 1}. ${c}`),
          "",
          'Answer with JSON: { "scores": [{ "criterion": 1, "reason": "...", "score": 2 }, ...] }',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Business rules the agent was given: ${input.rules.trim() || "(none)"}`,
          input.goal ? `What the caller wanted: ${input.goal}` : "",
          "",
          "The call:",
          call,
        ].join("\n"),
      },
    ],
    {
      temperature: 0,
      jsonSchema: {
        name: "call_review",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["scores"],
          properties: {
            scores: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["criterion", "reason", "score"],
                properties: {
                  criterion: { type: "integer" },
                  reason: { type: "string" },
                  score: { type: "integer", enum: [0, 1, 2] },
                },
              },
            },
          },
        },
      },
    },
  );
  const parsed = ReviewSchema.safeParse(safeJson(result.text));
  if (!parsed.success) throw new Error("The judge's answer couldn't be read.");
  // Every criterion must be graded once; the code maps numbers back to the criteria's text.
  const byNumber = new Map(parsed.data.scores.map((s) => [s.criterion, s]));
  const scores = criteria.map((criterion, i): JudgeScore => {
    const graded = byNumber.get(i + 1);
    if (!graded) throw new Error(`The judge skipped criterion ${i + 1}.`);
    return { criterion, reason: graded.reason, score: graded.score as 0 | 1 | 2 };
  });
  return { scores, llm: llmCallInfo(result) };
}

const ReviewSchema = z.object({
  scores: z.array(
    z.object({
      criterion: z.number().int(),
      reason: z.string(),
      score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    }),
  ),
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

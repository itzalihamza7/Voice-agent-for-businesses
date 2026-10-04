import { llmCallInfo, type LanguageModelProvider } from "@voice-agent/pipeline";
import type { LlmCallInfo, Sentiment, TraceEntry, TranscriptEntry } from "@voice-agent/shared";
import { z } from "zod";

// After a call: a language model writes a short summary and classifies sentiment, intent and
// outcome (structured output). Code adds what it can see for itself in the trace: the cost, and
// problems worth a look (guardrails, model errors, a flow that got stuck).

export interface CallAnalysis {
  summary: string;
  sentiment: Sentiment;
  /** A short label for what the caller wanted, e.g. "price question". */
  intent: string;
  outcome: "resolved" | "transferred" | "unresolved" | "failed";
  llm: LlmCallInfo;
}

const AnalysisSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  intent: z.string(),
  outcome: z.enum(["resolved", "transferred", "unresolved"]),
});

export async function analyzeCall(
  llm: LanguageModelProvider,
  transcript: TranscriptEntry[],
): Promise<CallAnalysis> {
  const call = transcript
    .filter((e) => e.role !== "system")
    .map((e) => `${e.role === "agent" ? "Agent" : "Caller"}: ${e.text}`)
    .join("\n");
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          "You review finished phone calls handled by an AI agent. Answer with JSON:",
          '- "summary": two sentences at most: what the caller wanted and what happened.',
          '- "sentiment": how the caller felt by the end: "positive", "neutral" or "negative".',
          '- "intent": what the caller wanted, as a short lowercase label of 1-4 words',
          '  (e.g. "price question", "book appointment", "opening hours").',
          '- "outcome": "resolved" if they got what they needed, "transferred" if passed to a',
          '  person, "unresolved" otherwise.',
        ].join("\n"),
      },
      { role: "user", content: call || "(Nothing was said.)" },
    ],
    {
      temperature: 0,
      jsonSchema: {
        name: "call_analysis",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "sentiment", "intent", "outcome"],
          properties: {
            summary: { type: "string" },
            sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
            intent: { type: "string" },
            outcome: { type: "string", enum: ["resolved", "transferred", "unresolved"] },
          },
        },
      },
    },
  );
  const parsed = AnalysisSchema.safeParse(safeJson(result.text));
  if (!parsed.success) throw new Error("The analysis couldn't be read.");
  return {
    ...parsed.data,
    intent: parsed.data.intent.trim().toLowerCase().slice(0, 40),
    llm: llmCallInfo(result),
  };
}

/** Language model cost of a call, summed from its trace (null if no cost was known). */
export function callCost(trace: TraceEntry[]): number | null {
  const costs = trace.flatMap(({ event }) =>
    "llm" in event && event.llm?.costUsd != null ? [event.llm.costUsd] : [],
  );
  return costs.length ? costs.reduce((a, b) => a + b, 0) : null;
}

/** Problems in a call worth a look, in plain words. */
export function callFlags(trace: TraceEntry[]): string[] {
  const flags = new Set<string>();
  for (const { event } of trace) {
    if (event.type === "guardrail") flags.add(`guardrail: ${event.kind}`);
    if (event.type === "llmError") flags.add("model error");
    if (event.type === "stuck") flags.add("flow stuck");
    if (event.type === "reask") flags.add("caller not understood");
    if ("llm" in event && event.llm?.promptCut) flags.add("prompt cut");
  }
  return [...flags];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

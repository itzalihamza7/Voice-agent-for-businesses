import type { CompletionResult, LanguageModelProvider } from "@voice-agent/pipeline";
import type { TraceEntry } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { analyzeCall, callCost, callFlags } from "./analysis";
import { clusterByEmbedding } from "./topics";

const llm = (text: string): LanguageModelProvider => ({
  name: "fake",
  model: "fake",
  complete: async (): Promise<CompletionResult> => ({
    text,
    model: "fake",
    latencyMs: 1,
    usage: null,
    costUsd: 0,
  }),
});

const info = (costUsd: number | null) => ({
  model: "m",
  latencyMs: 1,
  inputTokens: 1,
  outputTokens: 1,
  cachedInputTokens: 0,
  costUsd,
});

describe("call analysis", () => {
  it("reads the model's structured analysis", async () => {
    const analysis = await analyzeCall(
      llm(
        '{"summary":"Asked the price.","sentiment":"positive","intent":"Price Question","outcome":"resolved"}',
      ),
      [{ role: "caller", text: "How much?" }],
    );
    expect(analysis).toMatchObject({ intent: "price question", outcome: "resolved" });
  });

  it("sums the cost and flags problems from the trace", () => {
    const trace: TraceEntry[] = [
      {
        atMs: 0,
        event: { type: "aiResponse", nodeId: "a", instructions: "", text: "x", llm: info(0.001) },
      },
      {
        atMs: 5,
        event: { type: "pathChosen", nodeId: "b", label: "x", by: "ai", llm: info(0.0005) },
      },
      { atMs: 9, event: { type: "guardrail", nodeId: "a", kind: "ungrounded", detail: "" } },
      { atMs: 9, event: { type: "llmError", nodeId: "a", message: "timeout" } },
    ];
    expect(callCost(trace)).toBeCloseTo(0.0015);
    expect(callFlags(trace)).toEqual(["guardrail: ungrounded", "model error"]);
    expect(callCost([])).toBeNull();
  });

  it("clusters items whose embeddings are close", () => {
    const topics = clusterByEmbedding(
      ["price", "cost", "parking"],
      [
        [1, 0],
        [0.95, 0.1],
        [0, 1],
      ],
      0.9,
    );
    expect(topics.map((t) => t.items)).toEqual([["price", "cost"], ["parking"]]);
  });
});

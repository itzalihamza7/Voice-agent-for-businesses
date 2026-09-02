import type { CompletionResult, LanguageModelProvider } from "@voice-agent/pipeline";
import type { TranscriptEntry } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { updateSummary } from "./summary";

function llmAnswering(text: string) {
  const asked: string[] = [];
  const llm: LanguageModelProvider = {
    name: "fake",
    model: "fake",
    async complete(messages): Promise<CompletionResult> {
      asked.push(messages.map((m) => m.content).join("\n"));
      return { text, model: "fake", latencyMs: 1, usage: null, costUsd: 0 };
    },
  };
  return { llm, asked };
}

// 10 messages of ~50 tokens each.
const transcript: TranscriptEntry[] = Array.from({ length: 10 }, (_, i) => ({
  role: i % 2 ? "agent" : "caller",
  text: `message ${i} ${"z".repeat(190)}`,
}));

describe("updateSummary", () => {
  it("does nothing while the call is short", async () => {
    const { llm, asked } = llmAnswering('{"summary":"x"}');
    expect(await updateSummary(llm, transcript, null, 10_000)).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it("folds all but the last six messages into the summary", async () => {
    const { llm, asked } = llmAnswering('{"summary":"Caller asked about prices."}');
    const update = await updateSummary(
      llm,
      transcript,
      { text: "Earlier: greeted.", upTo: 1 },
      400,
    );
    expect(update?.summary).toEqual({ text: "Caller asked about prices.", upTo: 4 });
    expect(update?.added).toBe(3);
    expect(asked[0]).toContain("Summary so far: Earlier: greeted.");
    expect(asked[0]).toContain("message 1 ");
    expect(asked[0]).not.toContain("message 4 ");
  });

  it("skips an answer it can't read", async () => {
    const { llm } = llmAnswering("Sure! Here is a summary.");
    expect(await updateSummary(llm, transcript, null, 400)).toBeNull();
  });
});

import type { CompletionResult, LanguageModelProvider } from "@voice-agent/pipeline";
import { describe, expect, it } from "vitest";
import { checkFacts, normalizePhoneNumber, updateMemoryFacts } from "./memory";

const call = {
  summary: null,
  entries: [{ role: "caller" as const, text: "It's Ali, can Priya do my hair on Saturday?" }],
  cuts: { tokensBefore: 0, tokensAfter: 0, notesShortened: 0, messagesDropped: 0 },
};

function llmAnswering(text: string): LanguageModelProvider {
  return {
    name: "fake",
    model: "fake",
    complete: async (): Promise<CompletionResult> => ({
      text,
      model: "fake",
      latencyMs: 1,
      usage: null,
      costUsd: 0,
    }),
  };
}

describe("caller memory", () => {
  it("normalizes phone numbers", () => {
    expect(normalizePhoneNumber(" +44 7700-900 123 ")).toBe("+447700900123");
    expect(normalizePhoneNumber("(07700) 900123")).toBe("07700900123");
  });

  it("drops card numbers, empty and overlong facts, and keeps at most eight", () => {
    const facts = checkFacts([
      "Name is Ali.",
      "Paid with card 4111 1111 1111 1111.",
      "  ",
      "x".repeat(201),
      ...Array.from({ length: 10 }, (_, i) => `Fact ${i}.`),
    ]);
    expect(facts[0]).toBe("Name is Ali.");
    expect(facts.some((f) => f.includes("4111"))).toBe(false);
    expect(facts).toHaveLength(8);
  });

  it("updates the facts from the call, keeping only facts about the caller", async () => {
    const llm = llmAnswering(
      JSON.stringify({
        facts: [
          { fact: "Name is Ali.", about: "caller" },
          { fact: "Prefers Priya on Saturdays.", about: "caller" },
          { fact: "Haircuts cost £30.", about: "business" },
        ],
      }),
    );
    const result = await updateMemoryFacts(llm, "High Street Hair", [], call);
    expect(result.facts).toEqual(["Name is Ali.", "Prefers Priya on Saturdays."]);
  });

  it("keeps the old facts when the answer can't be read", async () => {
    const result = await updateMemoryFacts(llmAnswering("ok"), "Salon", ["Name is Ali."], call);
    expect(result.facts).toEqual(["Name is Ali."]);
  });
});

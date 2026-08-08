import { describe, expect, it } from "vitest";
import { FallbackLanguageModel } from "./fallback";
import { LanguageModelError, type CompletionResult, type LanguageModelProvider } from "./types";

function fake(model: string, outcome: string | Error): LanguageModelProvider {
  return {
    name: "fake",
    model,
    async complete(): Promise<CompletionResult> {
      if (outcome instanceof Error) throw outcome;
      return { text: outcome, model, latencyMs: 1, usage: null, costUsd: 0 };
    },
  };
}

describe("FallbackLanguageModel", () => {
  it("uses the main model when it works", async () => {
    const result = await new FallbackLanguageModel(
      fake("main", "hi"),
      fake("backup", "x"),
    ).complete([]);
    expect(result).toMatchObject({ text: "hi", model: "main" });
    expect(result.fellBackFrom).toBeUndefined();
  });

  it("asks the fallback model when the main one fails, and says so", async () => {
    const main = fake("qwen3:8b", new LanguageModelError("ollama failed after 3 attempts"));
    const result = await new FallbackLanguageModel(main, fake("gpt-4.1-mini", "hello")).complete(
      [],
    );
    expect(result).toMatchObject({
      text: "hello",
      model: "gpt-4.1-mini",
      fellBackFrom: { model: "qwen3:8b", error: "ollama failed after 3 attempts" },
    });
  });

  it("does not hide programming errors", async () => {
    const main = fake("main", new TypeError("bug"));
    await expect(new FallbackLanguageModel(main, fake("backup", "x")).complete([])).rejects.toThrow(
      TypeError,
    );
  });
});

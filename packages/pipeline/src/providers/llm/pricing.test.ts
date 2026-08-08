import { describe, expect, it } from "vitest";
import { openAiCostUsd } from "./pricing";

describe("openAiCostUsd", () => {
  it("prices input, cached input and output tokens separately", () => {
    // gpt-4.1-mini: $0.40 input, $0.10 cached input, $1.60 output per 1M tokens.
    const cost = openAiCostUsd("gpt-4.1-mini", {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      outputTokens: 100_000,
    });
    expect(cost).toBeCloseTo(0.6 * 0.4 + 0.4 * 0.1 + 0.1 * 1.6, 10);
  });

  it("is unknown for models without a price or without usage", () => {
    expect(
      openAiCostUsd("gpt-unknown", { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }),
    ).toBeNull();
    expect(openAiCostUsd("gpt-4.1-mini", null)).toBeNull();
  });
});

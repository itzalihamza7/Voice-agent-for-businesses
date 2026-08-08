import type { TokenUsage } from "./types";

// Prices in US dollars per 1 million tokens, standard tier.
// Source: https://developers.openai.com/api/docs/pricing (checked 2026-10-18).
// Prices change: re-check the page before relying on these numbers.
const OPENAI_PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

/** Estimated cost of one request. Cached input tokens are billed at the cheaper cached rate. */
export function openAiCostUsd(model: string, usage: TokenUsage | null): number | null {
  const price = OPENAI_PRICES[model];
  if (!price || !usage) return null;
  const uncachedInput = usage.inputTokens - usage.cachedInputTokens;
  return (
    (uncachedInput * price.input +
      usage.cachedInputTokens * price.cachedInput +
      usage.outputTokens * price.output) /
    1_000_000
  );
}

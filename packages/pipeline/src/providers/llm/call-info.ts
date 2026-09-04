import type { CompletionResult } from "./types";
import type { LlmCallInfo } from "@voice-agent/shared";

/** The details of one language model request that the UI shows (model, time, tokens, cost). */
export function llmCallInfo(result: CompletionResult): LlmCallInfo {
  return {
    model: result.model,
    latencyMs: result.latencyMs,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    cachedInputTokens: result.usage?.cachedInputTokens ?? null,
    costUsd: result.costUsd,
    ...(result.fellBackFrom ? { fellBackFrom: result.fellBackFrom } : {}),
    ...(result.promptCut ? { promptCut: true } : {}),
  };
}

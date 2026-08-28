import type { LlmCallInfo } from "@voice-agent/shared";

// One line of details under an AI message: model · time · tokens · cost (+ fallback, if any).

export function LlmMeta({ llm }: { llm: LlmCallInfo }) {
  const parts = [llm.model, `${(llm.latencyMs / 1000).toFixed(1)} s`];
  if (llm.inputTokens !== null) {
    const cached = llm.cachedInputTokens ? ` (${llm.cachedInputTokens} cached)` : "";
    parts.push(`${llm.inputTokens}→${llm.outputTokens ?? 0} tokens${cached}`);
  }
  parts.push(llm.costUsd === null ? "cost unknown" : formatCost(llm.costUsd));
  return (
    <span className="block text-[10px] text-gray-400 not-italic" data-testid="llm-meta">
      {parts.join(" · ")}
      {llm.fellBackFrom && (
        <span className="block text-amber-600" data-testid="fallback-note">
          Fallback: {llm.fellBackFrom.model} failed ({llm.fellBackFrom.error})
        </span>
      )}
    </span>
  );
}

/** Tiny amounts need more digits: one reply often costs a fraction of a cent. */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0 (local)";
  // Embedding a short document costs millionths of a dollar.
  if (usd < 0.000005) return "< $0.00001";
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(2)}`;
}

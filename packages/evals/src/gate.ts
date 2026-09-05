import type { EvalRun } from "@voice-agent/shared";

// The regression gate: a version can only go live after its evals have run, and not if its
// score dropped compared with the version that is live now.

/** Eval scores move a little between runs (models aren't fully deterministic). */
export const SCORE_TOLERANCE = 3;

export interface GoLiveDecision {
  allowed: boolean;
  reason: string;
}

/**
 * @param candidate the latest finished run of the version that should go live
 * @param live the latest finished run of the live version (null if none is live or never ran)
 */
export function goLiveDecision(
  version: number,
  candidate: EvalRun | null,
  live: EvalRun | null,
): GoLiveDecision {
  if (!candidate || candidate.status !== "done" || candidate.score === null) {
    return { allowed: false, reason: `Run the evals on v${version} first.` };
  }
  if (!live || live.score === null) {
    return {
      allowed: true,
      reason: `v${version} scored ${candidate.score}. Nothing to compare with.`,
    };
  }
  const sameModels = JSON.stringify(candidate.models) === JSON.stringify(live.models);
  const note = sameModels ? "" : " (the two runs used different models, so compare with care)";
  if (candidate.score < live.score - SCORE_TOLERANCE) {
    return {
      allowed: false,
      reason: `v${version} scored ${candidate.score}, below v${live.agentVersion}'s ${live.score}${note}. Fix the failing cases or run again.`,
    };
  }
  return {
    allowed: true,
    reason: `v${version} scored ${candidate.score} (v${live.agentVersion}: ${live.score})${note}.`,
  };
}

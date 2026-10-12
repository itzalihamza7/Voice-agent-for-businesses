import { createHash } from "node:crypto";

// Which version a call gets, and what a rollback goes back to.
//   - Live version: what callers get (set through the eval gate, see @voice-agent/evals).
//   - A/B test: a share of new calls gets a candidate version instead. The choice comes from a
//     hash of the call id, so it is stable for a call and spread evenly across calls.
//   - Rollback: back to the version that was live before the current one, without the gate
//     (it is for when something is wrong now).

export interface TrafficSplit {
  version: number;
  /** 0–100: the share of new calls that get `version`. */
  percent: number;
}

/** The version a new call should run. */
export function versionForCall(
  callId: string,
  live: number,
  split: TrafficSplit | null,
): { version: number; variant: "live" | "candidate" } {
  if (!split || split.percent <= 0 || split.version === live)
    return { version: live, variant: "live" };
  const bucket = createHash("sha256").update(callId).digest().readUInt32BE(0) % 100;
  return bucket < split.percent
    ? { version: split.version, variant: "candidate" }
    : { version: live, variant: "live" };
}

/** A past release: which version went live (or was rolled back to), newest first. */
export interface ReleaseEntry {
  version: number | null;
  kind: "live" | "rollback" | "split" | "split-stopped";
}

/** The version that was live before `current`, from the release history (newest first). */
export function rollbackTarget(history: ReleaseEntry[], current: number | null): number | null {
  for (const entry of history) {
    if ((entry.kind === "live" || entry.kind === "rollback") && entry.version !== null) {
      if (entry.version !== current) return entry.version;
    }
  }
  return null;
}

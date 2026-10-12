import { rollbackTarget, type ReleaseEntry } from "@voice-agent/agent-config";
import { DEFAULT_BUSINESS_ID } from "@voice-agent/db";
import { AgentNotFoundError } from "@voice-agent/orchestrator";
import { getEvalStore } from "./evals";
import { getPrisma } from "./store";

// Releases: what callers get (the live version, an A/B split), the history of changes, and a
// per-version comparison of live calls and eval scores.

async function agentOf(agentId: string, businessId = DEFAULT_BUSINESS_ID) {
  const agent = await getPrisma().agent.findFirst({ where: { id: agentId, businessId } });
  if (!agent) throw new AgentNotFoundError(agentId);
  return agent;
}

export async function recordRelease(
  agentId: string,
  kind: ReleaseEntry["kind"],
  version: number | null,
  note: string,
) {
  await getPrisma().release.create({ data: { agentId, kind, version, note } });
}

/** Back to the version that was live before the current one (no eval gate: it's for emergencies). */
export async function rollback(agentId: string): Promise<{ version: number } | { error: string }> {
  const agent = await agentOf(agentId);
  const history = await getPrisma().release.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
  });
  const target = rollbackTarget(history as ReleaseEntry[], agent.liveVersion);
  if (target === null) return { error: "No earlier live version to roll back to." };
  await getPrisma().agent.update({ where: { id: agentId }, data: { liveVersion: target } });
  await recordRelease(
    agentId,
    "rollback",
    target,
    `Rolled back from v${agent.liveVersion} to v${target}.`,
  );
  return { version: target };
}

/** Starts (or changes) an A/B split; percent 0 stops it. */
export async function setSplit(agentId: string, version: number, percent: number) {
  await agentOf(agentId);
  const stopping = percent === 0;
  await getPrisma().agent.update({
    where: { id: agentId },
    data: stopping
      ? { abVersion: null, abPercent: null }
      : { abVersion: version, abPercent: percent },
  });
  await recordRelease(
    agentId,
    stopping ? "split-stopped" : "split",
    stopping ? null : version,
    stopping ? "Stopped the A/B test." : `${percent}% of new calls get v${version}.`,
  );
}

export interface VersionStats {
  version: number;
  calls: number;
  resolvedPct: number | null;
  transferredPct: number | null;
  negativePct: number | null;
  avgCostUsd: number | null;
  evalScore: number | null;
}

/** Everything the Releases tab shows. */
export async function releaseOverview(agentId: string) {
  const agent = await agentOf(agentId);
  const prisma = getPrisma();
  const [history, calls, runs] = await Promise.all([
    prisma.release.findMany({ where: { agentId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.call.findMany({
      where: { agentId },
      select: { agentVersion: true, outcome: true, sentiment: true, costUsd: true },
    }),
    getEvalStore().listRuns(agentId),
  ]);
  const versions = [
    ...new Set([...calls.map((c) => c.agentVersion), ...runs.map((r) => r.agentVersion)]),
  ];
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);
  const comparison: VersionStats[] = versions
    .sort((a, b) => b - a)
    .map((version) => {
      const mine = calls.filter((c) => c.agentVersion === version);
      const costs = mine.flatMap((c) => (c.costUsd === null ? [] : [c.costUsd]));
      return {
        version,
        calls: mine.length,
        resolvedPct: pct(mine.filter((c) => c.outcome === "resolved").length, mine.length),
        transferredPct: pct(mine.filter((c) => c.outcome === "transferred").length, mine.length),
        negativePct: pct(mine.filter((c) => c.sentiment === "negative").length, mine.length),
        avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
        evalScore:
          runs.find((r) => r.agentVersion === version && r.status === "done")?.score ?? null,
      };
    });
  return {
    liveVersion: agent.liveVersion,
    split:
      agent.abVersion !== null ? { version: agent.abVersion, percent: agent.abPercent ?? 0 } : null,
    history: history.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    comparison,
  };
}

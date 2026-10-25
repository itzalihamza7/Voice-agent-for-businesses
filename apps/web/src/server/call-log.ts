import type { Prisma } from "@voice-agent/db";
import { analyzeCall, callCost, callFlags, clusterByEmbedding } from "@voice-agent/orchestrator";
import { createLanguageModel } from "@voice-agent/pipeline";
import type { TraceEntry, TurnResult } from "@voice-agent/shared";
import { currentBusinessId } from "./business";
import { getCallSessions } from "./calls";
import { defaultEmbeddingModel } from "./knowledge";
import { phoneModel } from "./phone";
import { applyRetention } from "./retention";
import { getPrisma } from "./store";

// The call log: finished calls (test and phone) with their transcript, trace, cost and a
// post-call analysis. Recorded once per LangGraph thread, when the call ends.

/** Records the call if this turn ended it. Analysis runs in the background. */
export async function recordIfEnded(callId: string, result: TurnResult): Promise<void> {
  if (result.state.nodeId !== null) return;
  const prisma = getPrisma();
  if (await prisma.call.findUnique({ where: { threadId: callId } })) return;
  const snapshot = await callSnapshot(callId);
  if (!snapshot) return;
  const call = await prisma.call.create({
    data: { ...snapshot.data, turns: { create: snapshot.turns } },
  });
  void analyze(call.id, snapshot.transcript, snapshot.trace);
  void applyRetention(snapshot.data.businessId).catch((error: unknown) =>
    console.warn(`Retention failed: ${String(error)}`),
  );
}

/**
 * Saves a website chat after every turn (visitors often just leave, so a chat is kept as it
 * goes); the analysis runs once the flow ends.
 */
export async function recordWebTurn(callId: string, result: TurnResult): Promise<void> {
  const snapshot = await callSnapshot(callId);
  if (!snapshot) return;
  const prisma = getPrisma();
  const existing = await prisma.call.findUnique({
    where: { threadId: callId },
    select: { id: true },
  });
  const call = existing
    ? (
        await prisma.$transaction([
          prisma.transcriptTurn.deleteMany({ where: { callId: existing.id } }),
          prisma.call.update({
            where: { id: existing.id },
            data: { ...snapshot.data, turns: { create: snapshot.turns } },
          }),
        ])
      )[1]
    : await prisma.call.create({ data: { ...snapshot.data, turns: { create: snapshot.turns } } });
  if (result.state.nodeId === null) {
    void analyze(call.id, snapshot.transcript, snapshot.trace);
    void applyRetention(snapshot.data.businessId).catch((error: unknown) =>
      console.warn(`Retention failed: ${String(error)}`),
    );
  }
}

/** The call's row and transcript lines, from its LangGraph thread. */
async function callSnapshot(callId: string) {
  const history = await (await getCallSessions()).history(callId);
  if (!history?.meta.agentId) return null;
  const agent = await getPrisma().agent.findUnique({ where: { id: history.meta.agentId } });
  if (!agent) return null;

  const { meta, state, trace } = history;
  const lastAt = trace.at(-1)?.atMs ?? 0;
  const spoken = state.transcript.filter((e) => e.role !== "system");
  return {
    transcript: state.transcript,
    trace,
    data: {
      businessId: agent.businessId,
      agentId: agent.id,
      agentVersion: meta.agentVersion ?? 0,
      startedAt: new Date(meta.startedAt),
      endedAt: new Date(meta.startedAt + lastAt),
      source: meta.source,
      threadId: callId,
      callerPhone: meta.callerPhone ?? null,
      trace: trace as unknown as Prisma.InputJsonArray,
      costUsd: callCost(trace),
      flags: callFlags(trace),
    },
    turns: spoken.map((entry, i) => ({
      speaker: entry.role === "agent" ? ("agent" as const) : ("caller" as const),
      text: entry.text,
      // Turn times aren't per line; spread a turn's lines a few ms apart to keep order.
      atMs: lineTime(trace, i),
    })),
  };
}

async function analyze(
  callId: string,
  transcript: Parameters<typeof analyzeCall>[1],
  trace: TraceEntry[],
) {
  try {
    const analysis = await analyzeCall(createLanguageModel(phoneModel()), transcript);
    const transferred = trace.some(({ event }) => event.type === "transfer");
    const failed = trace.some(({ event }) => event.type === "stuck" || event.type === "llmError");
    await getPrisma().call.update({
      where: { id: callId },
      data: {
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        // What the trace shows beats the model's reading of it.
        outcome: failed ? "failed" : transferred ? "transferred" : analysis.outcome,
      },
    });
  } catch (error) {
    console.warn(`Call analysis failed for ${callId}: ${String(error)}`);
  }
}

function lineTime(trace: TraceEntry[], index: number): number {
  return (trace.at(-1)?.atMs ?? 0) > 0 ? Math.round(index * 10) : index;
}

export interface CallRow {
  id: string;
  agentId: string;
  agentName: string;
  agentVersion: number;
  source: string;
  callerPhone: string | null;
  startedAt: string;
  durationMs: number | null;
  turns: number;
  costUsd: number | null;
  sentiment: string | null;
  intent: string | null;
  outcome: string | null;
  summary: string | null;
  flags: string[];
}

const flagsOf = (value: Prisma.JsonValue | null) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

export async function listCalls(businessId?: string, take = 200): Promise<CallRow[]> {
  const business = businessId ?? (await currentBusinessId());
  const rows = await getPrisma().call.findMany({
    where: { businessId: business },
    orderBy: { startedAt: "desc" },
    take,
    include: { agent: { select: { name: true } }, _count: { select: { turns: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    agentName: row.agent.name,
    agentVersion: row.agentVersion,
    source: row.source,
    callerPhone: row.callerPhone,
    startedAt: row.startedAt.toISOString(),
    durationMs: row.endedAt ? row.endedAt.getTime() - row.startedAt.getTime() : null,
    turns: row._count.turns,
    costUsd: row.costUsd,
    sentiment: row.sentiment,
    intent: row.intent,
    outcome: row.outcome,
    summary: row.summary,
    flags: flagsOf(row.flags),
  }));
}

export async function getCall(id: string, businessId?: string) {
  const business = businessId ?? (await currentBusinessId());
  const row = await getPrisma().call.findFirst({
    where: { id, businessId: business },
    include: { agent: { select: { name: true } }, turns: { orderBy: { atMs: "asc" } } },
  });
  if (!row) return null;
  return {
    ...(await listCalls(business)).find((c) => c.id === id)!,
    transcript: row.turns.map((t) => ({ speaker: t.speaker, text: t.text })),
    trace: (row.trace ?? []) as unknown as TraceEntry[],
  };
}

/** Totals for the dashboard's header. */
export function callStats(calls: CallRow[]) {
  const n = calls.length;
  const share = (outcome: string) =>
    n ? Math.round((calls.filter((c) => c.outcome === outcome).length / n) * 100) : 0;
  const costs = calls.flatMap((c) => (c.costUsd === null ? [] : [c.costUsd]));
  const durations = calls.flatMap((c) => (c.durationMs === null ? [] : [c.durationMs]));
  return {
    calls: n,
    resolvedPct: share("resolved"),
    transferredPct: share("transferred"),
    avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    avgDurationMs: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null,
    needingAttention: calls.filter((c) => c.flags.length || c.outcome === "failed").length,
  };
}

/**
 * Calls grouped by what they were about: calls with the same intent label go together, and
 * labels that mean the same ("price question", "haircut prices") are merged by the similarity of
 * their embeddings. Clustering whole summaries didn't work: at 0.75 every salon call looked
 * alike, at 0.9 two "price question" calls ended up apart.
 */
export async function callTopics(calls: CallRow[]) {
  const byIntent = new Map<string, CallRow[]>();
  for (const call of calls) {
    if (call.intent) byIntent.set(call.intent, [...(byIntent.get(call.intent) ?? []), call]);
  }
  const intents = [...byIntent.keys()];
  if (intents.length === 0) return [];
  const embedded = await defaultEmbeddingModel().embed(intents, "document");
  return clusterByEmbedding(intents, embedded.vectors, 0.85)
    .map((topic) => {
      const members = topic.items.flatMap((intent) => byIntent.get(intent)!);
      const label = topic.items.sort(
        (a, b) => byIntent.get(b)!.length - byIntent.get(a)!.length,
      )[0]!;
      return {
        label,
        intents: topic.items,
        calls: members.length,
        examples: members.slice(0, 3).map((c) => c.summary ?? ""),
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

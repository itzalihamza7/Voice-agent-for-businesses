import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { formatCost } from "@/features/builder/LlmMeta";
import { CallTable } from "@/features/dashboard/CallTable";
import { callStats, callTopics, listCalls } from "@/server/call-log";

export const metadata: Metadata = { title: "Calls" };

// The dashboard: totals, what callers call about (topics), calls that need a look, and the log.
export default async function CallsPage() {
  await connection();
  const calls = await listCalls();
  const stats = callStats(calls);
  const topics = await callTopics(calls).catch(() => []);
  const attention = calls.filter((c) => c.flags.length || c.outcome === "failed").slice(0, 8);
  const card = (label: string, value: string) => (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-baseline gap-4">
        <Link href="/" className="text-sm text-blue-600 underline">
          ← Agents
        </Link>
        <h1 className="text-xl font-semibold">Calls</h1>
      </div>
      <div className="grid grid-cols-6 gap-3" data-testid="call-stats">
        {card("Calls", String(stats.calls))}
        {card("Resolved", `${stats.resolvedPct}%`)}
        {card("Transferred", `${stats.transferredPct}%`)}
        {card(
          "Avg. length",
          stats.avgDurationMs === null ? "–" : `${Math.round(stats.avgDurationMs / 1000)} s`,
        )}
        {card("Avg. AI cost", stats.avgCostUsd === null ? "–" : formatCost(stats.avgCostUsd))}
        {card("Need a look", String(stats.needingAttention))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="font-semibold">What callers call about</h2>
          {topics.length === 0 ? (
            <p className="text-sm text-gray-500">Topics appear once calls have been analysed.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm" data-testid="topics">
              {topics.map((topic) => (
                <li key={topic.label}>
                  <span className="font-medium">{topic.label}</span>{" "}
                  <span className="text-gray-500">({topic.calls})</span>
                  <p className="text-xs text-gray-500">{topic.examples[0]}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="font-semibold">Calls that need a look</h2>
          {attention.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing flagged.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {attention.map((call) => (
                <li key={call.id}>
                  <Link href={`/dashboard/calls/${call.id}`} className="text-blue-600 underline">
                    {call.intent ?? "call"} · {new Date(call.startedAt).toLocaleString()}
                  </Link>{" "}
                  <span className="text-xs text-red-700">
                    {call.flags.join(", ") || call.outcome}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section>
        <h2 className="font-semibold">All calls</h2>
        <CallTable calls={calls} />
      </section>
    </main>
  );
}

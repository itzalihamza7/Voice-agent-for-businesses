import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Download } from "lucide-react";
import { formatCost } from "@/features/builder/LlmMeta";
import { CallTable } from "@/features/dashboard/CallTable";
import { PageHeader, StatCard } from "@/features/ui/PageHeader";
import { callStats, callTopics, listCalls } from "@/server/call-log";

export const metadata: Metadata = { title: "Calls" };

// The dashboard: totals, what callers call about (topics), calls that need a look, and the log.
export default async function CallsPage() {
  await connection();
  const calls = await listCalls();
  const stats = callStats(calls);
  const topics = await callTopics(calls).catch(() => []);
  const attention = calls.filter((c) => c.flags.length || c.outcome === "failed").slice(0, 8);
  const card = (label: string, value: string) => <StatCard label={label} value={value} />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Calls & analytics"
        description="Every call your agents took: outcomes, cost, what callers ask about, and the calls that need a look."
        actions={
          <a href="/api/calls/export" className="btn-secondary">
            <Download className="h-4 w-4" /> Export good calls (JSONL)
          </a>
        }
      />
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        data-testid="call-stats"
      >
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
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">What callers call about</h2>
          {topics.length === 0 ? (
            <p className="text-sm text-slate-500">Topics appear once calls have been analysed.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm" data-testid="topics">
              {topics.map((topic) => (
                <li key={topic.label}>
                  <span className="font-medium">{topic.label}</span>{" "}
                  <span className="text-slate-500">({topic.calls})</span>
                  <p className="text-xs text-slate-500">{topic.examples[0]}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Calls that need a look</h2>
          {attention.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing flagged.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {attention.map((call) => (
                <li key={call.id}>
                  <Link
                    href={`/dashboard/calls/${call.id}`}
                    className="text-brand-600 hover:underline"
                  >
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
      <section className="card p-5">
        <h2 className="font-semibold">All calls</h2>
        <CallTable calls={calls} />
      </section>
    </div>
  );
}

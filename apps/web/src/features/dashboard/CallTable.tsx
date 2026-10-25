import Link from "next/link";
import type { CallRow } from "@/server/call-log";
import { formatCost } from "../builder/LlmMeta";

// The call log: one row per finished call, newest first.

const OUTCOME_STYLE: Record<string, string> = {
  resolved: "bg-emerald-100 text-emerald-800",
  transferred: "bg-sky-100 text-sky-800",
  unresolved: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

export function CallTable({ calls }: { calls: CallRow[] }) {
  if (calls.length === 0) {
    return (
      <p className="mt-4 text-gray-500">
        No calls yet. Finish a test call in the builder, or call an agent&apos;s number.
      </p>
    );
  }
  return (
    <table className="mt-2 w-full text-sm" data-testid="call-table">
      <thead className="text-left text-xs text-gray-500">
        <tr>
          <th className="py-1">When</th>
          <th>Agent</th>
          <th>Source</th>
          <th>Intent</th>
          <th>Outcome</th>
          <th>Sentiment</th>
          <th>Length</th>
          <th>Cost</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => (
          <tr key={call.id} className="border-t border-gray-100 align-top">
            <td className="py-1.5">
              <Link href={`/dashboard/calls/${call.id}`} className="text-blue-600 underline">
                {new Date(call.startedAt).toLocaleString()}
              </Link>
            </td>
            <td>
              {call.agentName} <span className="text-gray-400">v{call.agentVersion}</span>
            </td>
            <td>
              {call.source === "phone"
                ? `📞 ${call.callerPhone ?? ""}`
                : call.source === "web"
                  ? "💬 website"
                  : "test"}
            </td>
            <td>{call.intent ?? <span className="text-gray-400">analysing…</span>}</td>
            <td>
              {call.outcome && (
                <span className={`rounded px-1.5 text-xs ${OUTCOME_STYLE[call.outcome] ?? ""}`}>
                  {call.outcome}
                </span>
              )}
            </td>
            <td>{call.sentiment ?? ""}</td>
            <td>{call.durationMs === null ? "" : `${Math.round(call.durationMs / 1000)} s`}</td>
            <td>{call.costUsd === null ? "" : formatCost(call.costUsd)}</td>
            <td className="text-xs text-red-700">{call.flags.join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

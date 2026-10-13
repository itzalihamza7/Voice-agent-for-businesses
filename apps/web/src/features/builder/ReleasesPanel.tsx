"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCost } from "./LlmMeta";

// The Releases tab: which version callers get, rolling back, A/B tests, and how versions compare
// on live calls and evals.

interface Overview {
  liveVersion: number | null;
  split: { version: number; percent: number } | null;
  history: { id: string; kind: string; version: number | null; note: string; createdAt: string }[];
  comparison: {
    version: number;
    calls: number;
    resolvedPct: number | null;
    transferredPct: number | null;
    negativePct: number | null;
    avgCostUsd: number | null;
    evalScore: number | null;
  }[];
}

export function ReleasesPanel({ agentId, versions }: { agentId: string; versions: number[] }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [candidate, setCandidate] = useState(versions.at(-1) ?? 1);
  const [percent, setPercent] = useState(10);

  const fetchOverview = useCallback(
    () => fetch(`/api/agents/${agentId}/releases`).then((r) => r.json() as Promise<Overview>),
    [agentId],
  );
  useEffect(() => {
    let cancelled = false;
    fetchOverview()
      .then((data) => !cancelled && setOverview(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchOverview]);

  async function act(path: string, init: RequestInit, done: string) {
    const response = await fetch(`/api/agents/${agentId}/${path}`, init);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? { text: done } : { text: body.error ?? "Not allowed.", error: true });
    setOverview(await fetchOverview());
  }

  const split = (version: number, pct: number) =>
    act(
      "split",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, percent: pct }),
      },
      pct ? `${pct}% of new calls now get v${version}.` : "A/B test stopped.",
    );
  const pctText = (value: number | null) => (value === null ? "–" : `${value}%`);

  if (!overview) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-gray-200"
      data-testid="releases"
    >
      <section className="space-y-5 overflow-y-auto p-6">
        <div>
          <h2 className="font-semibold">Live</h2>
          <p className="text-sm">
            Callers get{" "}
            <b>{overview.liveVersion ? `v${overview.liveVersion}` : "the latest version"}</b>
            {overview.split &&
              `, and ${overview.split.percent}% of new calls get v${overview.split.version} (A/B test)`}
            .
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Versions go live from the Evals tab, through the eval gate.
          </p>
          <button
            type="button"
            onClick={() => void act("rollback", { method: "POST" }, "Rolled back.")}
            className="mt-2 rounded border border-red-300 px-3 py-1 text-sm text-red-700"
          >
            Roll back to the previous live version
          </button>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">A/B test</h2>
          <div className="flex items-end gap-2 text-sm">
            <label>
              <span className="block text-xs text-gray-600">Candidate</span>
              <select
                aria-label="Candidate version"
                className="rounded border border-gray-300 px-1 py-0.5"
                value={candidate}
                onChange={(e) => setCandidate(Number(e.target.value))}
              >
                {[...versions].reverse().map((v) => (
                  <option key={v} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-xs text-gray-600">Share of new calls</span>
              <select
                aria-label="Share of calls"
                className="rounded border border-gray-300 px-1 py-0.5"
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              >
                {[5, 10, 20, 50].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void split(candidate, percent)}
              className="rounded bg-blue-600 px-3 py-1 text-white"
            >
              Start
            </button>
            {overview.split && (
              <button
                type="button"
                onClick={() => void split(overview.split!.version, 0)}
                className="rounded border border-gray-300 px-3 py-1"
              >
                Stop
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            The candidate needs a finished eval run. Each call keeps the version it started with.
          </p>
        </div>
        {message && (
          <p
            className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}
            data-testid="releases-message"
          >
            {message.text}
          </p>
        )}
        <div>
          <h2 className="font-semibold">History</h2>
          <ul className="mt-1 space-y-1 text-xs">
            {overview.history.map((r) => (
              <li key={r.id}>
                <span className="text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>{" "}
                {r.note}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="overflow-y-auto p-6">
        <h2 className="font-semibold">Compare versions</h2>
        <table className="mt-2 w-full text-sm" data-testid="version-comparison">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th>Version</th>
              <th>Eval score</th>
              <th>Calls</th>
              <th>Resolved</th>
              <th>Transferred</th>
              <th>Unhappy</th>
              <th>AI cost / call</th>
            </tr>
          </thead>
          <tbody>
            {overview.comparison.map((row) => (
              <tr key={row.version} className="border-t border-gray-100">
                <td>
                  v{row.version}
                  {row.version === overview.liveVersion && (
                    <span className="ml-1 rounded bg-emerald-100 px-1 text-xs text-emerald-800">
                      live
                    </span>
                  )}
                </td>
                <td>{row.evalScore ?? "–"}</td>
                <td>{row.calls}</td>
                <td>{pctText(row.resolvedPct)}</td>
                <td>{pctText(row.transferredPct)}</td>
                <td>{pctText(row.negativePct)}</td>
                <td>{row.avgCostUsd === null ? "–" : formatCost(row.avgCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

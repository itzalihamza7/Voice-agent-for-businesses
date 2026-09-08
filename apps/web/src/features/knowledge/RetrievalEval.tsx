"use client";

import { useState } from "react";

// Retrieval test: 18 spoken questions about the example documents with known answers. Shows how
// often the right passage comes first (recall@1), in the top 3 (recall@3), and MRR.

interface Report {
  questions: number;
  recallAt1: number;
  recallAt3: number;
  mrr: number;
  misses: { question: string; got: string[] }[];
  latencyMs: number;
}

const MODES = ["keyword", "vector", "hybrid"] as const;

export function RetrievalEval({ embeddingModel }: { embeddingModel: string }) {
  const [reports, setReports] = useState<Partial<Record<(typeof MODES)[number], Report>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setReports({});
    for (const mode of MODES) {
      const response = await fetch("/api/knowledge/retrieval-eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, embeddingModel, rerank: null }),
      });
      const body = (await response.json()) as { report?: Report; error?: string };
      if (!body.report) {
        setError(body.error ?? `HTTP ${response.status}`);
        break;
      }
      setReports((current) => ({ ...current, [mode]: body.report }));
    }
    setBusy(false);
  }

  const pct = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <div className="space-y-2 border-t border-gray-200 pt-4" data-testid="retrieval-eval">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Retrieval test (example documents)</h3>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !embeddingModel}
          className="text-xs text-blue-600 underline disabled:opacity-40"
        >
          {busy ? "Testing…" : "Run 18 questions"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {Object.keys(reports).length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th>Search</th>
              <th>Recall@1</th>
              <th>Recall@3</th>
              <th>MRR</th>
              <th>Missed (not in top 3)</th>
            </tr>
          </thead>
          <tbody>
            {MODES.filter((m) => reports[m]).map((mode) => {
              const r = reports[mode]!;
              return (
                <tr key={mode} className="border-t border-gray-100 align-top">
                  <td>{mode}</td>
                  <td>{pct(r.recallAt1)}</td>
                  <td>{pct(r.recallAt3)}</td>
                  <td>{r.mrr.toFixed(2)}</td>
                  <td className="text-gray-500">
                    {r.misses.map((m) => m.question).join("; ") || "none"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

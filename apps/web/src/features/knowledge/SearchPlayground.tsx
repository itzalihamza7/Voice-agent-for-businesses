"use client";

import type { LlmCallInfo } from "@voice-agent/shared";
import { useEffect, useState } from "react";
import { formatCost } from "../builder/LlmMeta";
import { toModelSpec, useModelOptions } from "../builder/ModelPicker";

// Search playground: one search shows keyword, vector and final (hybrid, optionally rewritten
// and reranked) results side by side, to see what each method finds.

interface Hit {
  chunkId: string;
  documentTitle: string;
  heading: string | null;
  content: string;
  score: number;
}

interface Outcome {
  query: string;
  searchQuery: string;
  keyword: Hit[];
  vector: Hit[];
  results: Hit[];
  latencyMs: number;
  embeddingCostUsd: number | null;
  llm: LlmCallInfo[];
}

export function SearchPlayground() {
  const { options } = useModelOptions();
  const [embeddingModels, setEmbeddingModels] = useState<string[]>([]);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [query, setQuery] = useState("how much would it be for my little boy, he's eight");
  const [rewrite, setRewrite] = useState("");
  const [rerank, setRerank] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/knowledge/models")
      .then((r) => r.json() as Promise<{ models: string[] }>)
      .then((body) => {
        if (cancelled) return;
        setEmbeddingModels(body.models);
        setEmbeddingModel((current) => current || body.models[0] || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function search() {
    setState({ busy: true });
    const response = await fetch("/api/knowledge/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        mode: "hybrid",
        limit: 5,
        embeddingModel,
        rewrite: toModelSpec(rewrite),
        rerank: toModelSpec(rerank),
      }),
    });
    const body = (await response.json()) as Outcome & { error?: string };
    if (!response.ok) {
      setState({ error: body.error ?? `HTTP ${response.status}` });
      return;
    }
    setOutcome(body);
    setState({});
  }

  const aiCost = outcome?.llm.reduce((sum, c) => sum + (c.costUsd ?? 0), 0) ?? 0;

  return (
    <section className="space-y-4 overflow-y-auto p-6" data-testid="search-playground">
      <div>
        <h2 className="font-semibold">Search playground</h2>
        <p className="text-sm text-gray-500">
          See what each search method finds. Calls use hybrid search with the first embedding model.
        </p>
      </div>
      <textarea
        aria-label="Search question"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        rows={2}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>
          <span className="text-gray-600">Embedding model</span>
          <select
            aria-label="Embedding model"
            className="mt-1 w-full rounded border border-gray-300 px-1 py-0.5"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
          >
            {embeddingModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["Rewrite question with", rewrite, setRewrite],
            ["Rerank with", rerank, setRerank],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label}>
            <span className="text-gray-600">{label}</span>
            <select
              aria-label={label}
              className="mt-1 w-full rounded border border-gray-300 px-1 py-0.5"
              value={value}
              onChange={(e) => set(e.target.value)}
            >
              <option value="">Off</option>
              {options.map((o) => (
                <option key={`${o.provider}|${o.model}`} value={`${o.provider}|${o.model}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={search}
        disabled={!query.trim() || !embeddingModel || state.busy}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {state.busy ? "Searching…" : "Search"}
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {outcome && (
        <>
          <p className="text-xs text-gray-500" data-testid="search-summary">
            {outcome.searchQuery !== outcome.query && (
              <>Searched for &quot;{outcome.searchQuery}&quot; · </>
            )}
            {(outcome.latencyMs / 1000).toFixed(1)} s · AI {formatCost(aiCost)}
            {outcome.llm.map((c) => ` · ${c.model} ${(c.latencyMs / 1000).toFixed(1)} s`).join("")}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Results title="Keyword" hits={outcome.keyword} testId="results-keyword" />
            <Results title="Vector (meaning)" hits={outcome.vector} testId="results-vector" />
            <Results
              title={rerank ? "Final (hybrid + rerank)" : "Final (hybrid)"}
              hits={outcome.results}
              testId="results-final"
            />
          </div>
        </>
      )}
    </section>
  );
}

function Results({ title, hits, testId }: { title: string; hits: Hit[]; testId: string }) {
  return (
    <div className="space-y-1" data-testid={testId}>
      <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
      {hits.length === 0 && <p className="text-xs text-gray-400">Nothing (relevant) found</p>}
      {hits.slice(0, 5).map((hit, i) => (
        <div
          key={hit.chunkId}
          className="rounded border border-gray-200 p-2 text-xs"
          data-testid="hit"
        >
          <div className="flex justify-between gap-1">
            <span className="font-medium">
              {i + 1}. {hit.heading ?? hit.documentTitle}
            </span>
            <span className="text-gray-400">{hit.score.toFixed(3)}</span>
          </div>
          <p className="line-clamp-3 text-gray-600">{hit.content}</p>
        </div>
      ))}
    </div>
  );
}

"use client";

import type { EvalCase, EvalCaseResult, EvalRun, NewEvalCase } from "@voice-agent/shared";
import { useCallback, useEffect, useState } from "react";
import { formatCost } from "./LlmMeta";
import { toModelSpec, useModelOptions } from "./ModelPicker";

// The Evals tab: test cases for the agent, running them against a saved version, the history
// of runs, and "Go live" (allowed only if the version's score didn't drop: the regression gate).

interface Props {
  agentId: string;
  versions: number[];
}

export function EvalsPanel({ agentId, versions }: Props) {
  const { options } = useModelOptions();
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [liveVersion, setLiveVersion] = useState<number | null>(null);
  const [version, setVersion] = useState(versions.at(-1) ?? 1);
  const [agentModel, setAgentModel] = useState("");
  const [callerModel, setCallerModel] = useState("");
  const [judgeModel, setJudgeModel] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<EvalCaseResult[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const base = `/api/agents/${agentId}/evals`;
  const fetchAll = useCallback(
    () =>
      Promise.all([
        fetch(`${base}/cases`).then((r) => r.json() as Promise<{ cases: EvalCase[] }>),
        fetch(`${base}/runs`).then(
          (r) => r.json() as Promise<{ runs: EvalRun[]; liveVersion: number | null }>,
        ),
      ]),
    [base],
  );
  const apply = useCallback(([casesBody, runsBody]: Awaited<ReturnType<typeof fetchAll>>) => {
    setCases(casesBody.cases);
    setRuns(runsBody.runs);
    setLiveVersion(runsBody.liveVersion);
  }, []);
  const load = async () => apply(await fetchAll());

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((data) => {
        if (!cancelled) apply(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchAll, apply]);

  // Defaults until a model is picked: a small model for the agent and the callers, a stronger
  // one to judge (the judge should be stronger than what it grades).
  const pick = (preferred: string[]) => {
    const found =
      preferred.map((m) => options.find((o) => o.model === m)).find(Boolean) ?? options[0];
    return found ? `${found.provider}|${found.model}` : "";
  };
  const agentChoice = agentModel || pick(["gpt-4.1-nano", "qwen3:8b"]);
  const callerChoice = callerModel || pick(["gpt-4.1-nano", "qwen3:8b"]);
  const judgeChoice = judgeModel || pick(["gpt-4.1-mini", "gpt-4.1-nano"]);

  async function runEvals() {
    setMessage(null);
    setResults([]);
    const started = await fetch(`${base}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version,
        models: {
          agent: toModelSpec(agentChoice),
          caller: toModelSpec(callerChoice),
          judge: judgeModel === "none" ? null : toModelSpec(judgeChoice),
        },
      }),
    });
    const body = (await started.json()) as { run?: EvalRun; error?: string };
    if (!body.run)
      return setMessage({ text: body.error ?? "Couldn't start the run.", error: true });
    const run = body.run;
    setProgress({ done: 0, total: run.caseIds.length });
    for (const [index, caseId] of run.caseIds.entries()) {
      const response = await fetch(`${base}/runs/${run.id}/cases/${caseId}`, { method: "POST" });
      const out = (await response.json()) as { result?: EvalCaseResult; error?: string };
      if (out.result) setResults((current) => [...current, out.result!]);
      else setMessage({ text: out.error ?? `Case failed (HTTP ${response.status})`, error: true });
      setProgress({ done: index + 1, total: run.caseIds.length });
    }
    await load();
    setProgress(null);
  }

  async function goLive(v: number) {
    const response = await fetch(`/api/agents/${agentId}/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: v }),
    });
    const body = (await response.json()) as { reason?: string; error?: string };
    setMessage(
      response.ok
        ? { text: `v${v} is live. ${body.reason ?? ""}` }
        : { text: body.error ?? "Not allowed.", error: true },
    );
    await load();
  }

  async function deleteCase(id: string) {
    await fetch(`${base}/cases/${id}`, { method: "DELETE" });
    await load();
  }

  const modelSelect = (label: string, value: string, set: (v: string) => void, none = false) => (
    <label className="text-xs">
      <span className="text-gray-600">{label}</span>
      <select
        aria-label={label}
        className="mt-0.5 w-full rounded border border-gray-300 px-1 py-0.5"
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        {none && <option value="none">No judge (checks only)</option>}
        {options.map((o) => (
          <option key={`${o.provider}|${o.model}`} value={`${o.provider}|${o.model}`}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-gray-200" data-testid="evals">
      <section className="space-y-4 overflow-y-auto p-6">
        <div>
          <h2 className="font-semibold">Test cases ({cases.length})</h2>
          <p className="text-sm text-gray-500">
            Scripted callers are checked by code; simulated callers are played by a model. A judge
            model grades both.
          </p>
        </div>
        <ul className="space-y-2">
          {cases.map((c) => (
            <li
              key={c.id}
              className="rounded border border-gray-200 p-2 text-sm"
              data-testid="eval-case"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <button
                  type="button"
                  className="text-xs text-red-600 underline"
                  onClick={() => void deleteCase(c.id)}
                >
                  Delete
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {c.definition.kind === "script"
                  ? `Script: ${c.definition.turns.map((t) => `“${t}”`).join(" → ")}`
                  : `Simulated: ${c.definition.persona} Goal: ${c.definition.goal}`}
              </p>
            </li>
          ))}
        </ul>
        <AddCase
          onAdd={async (input) => {
            const response = await fetch(`${base}/cases`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!response.ok) setMessage({ text: "That case isn't valid.", error: true });
            await load();
          }}
        />
      </section>

      <section className="space-y-4 overflow-y-auto p-6">
        <h2 className="font-semibold">Run</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            <span className="text-gray-600">Version</span>
            <select
              aria-label="Version"
              className="mt-0.5 w-full rounded border border-gray-300 px-1 py-0.5"
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
            >
              {[...versions].reverse().map((v) => (
                <option key={v} value={v}>
                  v{v}
                  {v === liveVersion ? " (live)" : ""}
                </option>
              ))}
            </select>
          </label>
          {modelSelect("Agent model", agentChoice, setAgentModel)}
          {modelSelect("Caller model", callerChoice, setCallerModel)}
          {modelSelect(
            "Judge model",
            judgeModel === "none" ? "none" : judgeChoice,
            setJudgeModel,
            true,
          )}
        </div>
        <button
          type="button"
          disabled={!cases.length || !agentChoice || progress !== null}
          onClick={() => void runEvals()}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {progress
            ? `Running ${progress.done}/${progress.total}…`
            : `Run ${cases.length} cases on v${version}`}
        </button>
        {message && (
          <p
            className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}
            data-testid="evals-message"
          >
            {message.text}
          </p>
        )}
        {results.length > 0 && <Results results={results} />}

        <div>
          <h3 className="text-sm font-semibold">History</h3>
          <table className="mt-1 w-full text-xs" data-testid="eval-runs">
            <thead className="text-left text-gray-500">
              <tr>
                <th>Version</th>
                <th>Score</th>
                <th>Passed</th>
                <th>Agent / judge</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-gray-100">
                  <td>
                    v{run.agentVersion}
                    {run.agentVersion === liveVersion && (
                      <span className="ml-1 rounded bg-emerald-100 px-1 text-emerald-800">
                        live
                      </span>
                    )}
                  </td>
                  <td>{run.status === "done" ? run.score : "running…"}</td>
                  <td>
                    {run.results.filter((r) => r.passed).length}/{run.caseIds.length}
                  </td>
                  <td>
                    {run.models.agent.model ?? run.models.agent.provider} /{" "}
                    {run.models.judge?.model ?? "none"}
                  </td>
                  <td>
                    {run.status === "done" && run.agentVersion !== liveVersion && (
                      <button
                        type="button"
                        className="text-blue-600 underline"
                        onClick={() => void goLive(run.agentVersion)}
                      >
                        Go live
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Results({ results }: { results: EvalCaseResult[] }) {
  return (
    <ul className="space-y-2" data-testid="eval-results">
      {results.map((r) => {
        const cost = r.llm.reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
        return (
          <li key={r.caseId} className="rounded border border-gray-200 p-2 text-xs">
            <div className="flex justify-between">
              <span className="font-medium">
                {r.passed ? "✅" : "❌"} {r.name}
              </span>
              <span className="text-gray-500">
                {Math.round(r.score * 100)}% · {(r.latencyMs / 1000).toFixed(1)} s ·{" "}
                {formatCost(cost)}
              </span>
            </div>
            {r.error && <p className="text-red-600">{r.error}</p>}
            {r.checks
              .filter((c) => !c.passed)
              .map((c) => (
                <p key={c.name} className="text-red-600">
                  {c.name}: {c.detail}
                </p>
              ))}
            {r.judge
              ?.filter((j) => j.score < 2)
              .map((j) => (
                <p key={j.criterion} className={j.score === 0 ? "text-red-600" : "text-amber-700"}>
                  Judge {j.score}/2 — {j.criterion.split(":")[0]}: {j.reason}
                </p>
              ))}
            <details>
              <summary className="cursor-pointer text-gray-500">Transcript</summary>
              {r.transcript
                .filter((e) => e.role !== "system")
                .map((e, i) => (
                  <p key={i}>
                    <b>{e.role === "agent" ? "Agent" : "Caller"}:</b> {e.text}
                  </p>
                ))}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function AddCase({ onAdd }: { onAdd: (input: NewEvalCase) => Promise<void> }) {
  const [kind, setKind] = useState<"script" | "simulated">("script");
  const [name, setName] = useState("");
  const [lines, setLines] = useState("");
  const [mustSay, setMustSay] = useState("");
  const [mustNotSay, setMustNotSay] = useState("");
  const [endsWith, setEndsWith] = useState("");
  const [persona, setPersona] = useState("");
  const [goal, setGoal] = useState("");
  const [criteria, setCriteria] = useState("");
  const list = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  async function add() {
    const definition =
      kind === "script"
        ? {
            kind,
            turns: list(lines),
            expect: {
              ...(endsWith ? { endsWith: endsWith as "end" | "transfer" | "stillTalking" } : {}),
              variables: {},
              mustSay: list(mustSay),
              mustNotSay: list(mustNotSay),
              visits: [],
            },
          }
        : { kind, persona, goal, maxTurns: 6 };
    await onAdd({ name, definition, criteria: list(criteria) });
    setName("");
    setLines("");
    setMustSay("");
    setMustNotSay("");
    setPersona("");
    setGoal("");
    setCriteria("");
  }

  const area = (label: string, value: string, set: (v: string) => void, rows = 2) => (
    <textarea
      aria-label={label}
      placeholder={label}
      rows={rows}
      className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
      value={value}
      onChange={(e) => set(e.target.value)}
    />
  );

  return (
    <div className="space-y-2 rounded border border-gray-200 p-3" data-testid="add-eval-case">
      <h3 className="text-sm font-semibold">Add a case</h3>
      <div className="flex gap-2">
        <input
          aria-label="Case name"
          placeholder="Name, e.g. Gives the Saturday hours"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label="Case kind"
          className="rounded border border-gray-300 text-xs"
          value={kind}
          onChange={(e) => setKind(e.target.value as "script" | "simulated")}
        >
          <option value="script">Scripted caller</option>
          <option value="simulated">Simulated caller</option>
        </select>
      </div>
      {kind === "script" ? (
        <>
          {area("What the caller says, one line per turn", lines, setLines, 3)}
          {area("Agent must say (one per line; a|b = either)", mustSay, setMustSay)}
          {area("Agent must never say (one per line)", mustNotSay, setMustNotSay)}
          <select
            aria-label="Call should end"
            className="rounded border border-gray-300 text-xs"
            value={endsWith}
            onChange={(e) => setEndsWith(e.target.value)}
          >
            <option value="">Any ending</option>
            <option value="end">Call ends</option>
            <option value="transfer">Call is transferred</option>
            <option value="stillTalking">Call is still going</option>
          </select>
        </>
      ) : (
        <>
          {area("Persona: who is calling and how they talk", persona, setPersona)}
          {area("Goal: what they want from the call", goal, setGoal)}
        </>
      )}
      {area("Extra judge criteria (one per line, optional)", criteria, setCriteria)}
      <button
        type="button"
        disabled={
          !name.trim() ||
          (kind === "script" ? !list(lines).length : !persona.trim() || !goal.trim())
        }
        onClick={() => void add()}
        className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-40"
      >
        Add case
      </button>
    </div>
  );
}

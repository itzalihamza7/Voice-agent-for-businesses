"use client";

import type { ModelOption, ModelSpec } from "@voice-agent/shared";
import { useEffect, useState } from "react";

// Chooses which language model does which job in a test call (model routing), plus a fallback.
// The list comes from GET /api/models: every model installed in Ollama and the allowed OpenAI models.

/** Option keys are "provider|model"; "" means no model for that job. */
export interface ModelChoice {
  decisions: string;
  replies: string;
  fallback: string;
}

const keyOf = (option: ModelOption) => `${option.provider}|${option.model}`;

export function toModelSpec(key: string): ModelSpec | null {
  if (!key) return null;
  const [provider = "", ...model] = key.split("|");
  return { provider, model: model.join("|") };
}

/** Local model for both jobs when there is one, with OpenAI as the fallback. */
export function defaultModelChoice(options: ModelOption[]): ModelChoice {
  const local = options.find((option) => option.provider === "ollama");
  const hosted = options.find((option) => option.provider === "openai");
  const main = local ?? hosted;
  return {
    decisions: main ? keyOf(main) : "",
    replies: main ? keyOf(main) : "",
    fallback: local && hosted ? keyOf(hosted) : "",
  };
}

export function useModelOptions() {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((response) => response.json() as Promise<{ models: ModelOption[]; problems: string[] }>)
      .then((body) => {
        if (cancelled) return;
        setOptions(body.models);
        setProblems(body.problems);
      })
      .catch(() => {
        if (!cancelled) setProblems(["Could not load the model list."]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { options, problems };
}

interface Props {
  options: ModelOption[];
  problems: string[];
  choice: ModelChoice;
  onChange: (choice: ModelChoice) => void;
}

const JOBS = [
  { job: "decisions", label: "Branch decisions", none: "None (pick paths by hand)" },
  { job: "replies", label: "AI replies", none: "None (only show instructions)" },
  { job: "fallback", label: "Fallback", none: "None" },
] as const;

export function ModelPicker({ options, problems, choice, onChange }: Props) {
  return (
    <div className="space-y-1">
      {JOBS.map(({ job, label, none }) => (
        <label key={job} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-gray-600">{label}</span>
          <select
            aria-label={label}
            value={choice[job]}
            onChange={(event) => onChange({ ...choice, [job]: event.target.value })}
            className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-0.5"
          >
            <option value="">{none}</option>
            {options.map((option) => (
              <option key={keyOf(option)} value={keyOf(option)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {problems.map((problem) => (
        <p key={problem} className="text-xs text-amber-700">
          {problem}
        </p>
      ))}
    </div>
  );
}

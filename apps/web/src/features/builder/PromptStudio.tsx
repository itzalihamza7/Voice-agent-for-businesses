"use client";

import {
  BUILT_IN_VARIABLES,
  builtInVariables,
  buildSystemPrompt,
  estimateTokens,
  unknownVariables,
  VOICE_STYLE_RULES,
  type AgentFlow,
  type LlmCallInfo,
  type PromptSettings,
  type VoiceStyle,
} from "@voice-agent/shared";
import { useState, type ReactNode } from "react";
import { formatCost, LlmMeta } from "./LlmMeta";
import { toModelSpec, useModelOptions } from "./ModelPicker";
import { newId } from "./node-catalog";

// Prompt studio: edit the agent's prompt settings (left) and compare the saved prompt (A)
// with your edits (B) on the same input in the playground (right).

interface Props {
  prompt: PromptSettings;
  onChange: (prompt: PromptSettings) => void;
  /** The prompt of the version that is open in the builder: "A" in the playground. */
  savedPrompt: PromptSettings;
  savedLabel: string;
  flow: AgentFlow;
}

const CUSTOM = "__custom__";

export function PromptStudio({ prompt, onChange, savedPrompt, savedLabel, flow }: Props) {
  const aiSteps = flow.nodes.flatMap((node) =>
    node.type === "aiResponse" && node.data.instructions.trim()
      ? [{ id: node.id, instructions: node.data.instructions }]
      : [],
  );
  const askVariables = flow.nodes.flatMap((node) =>
    node.type === "ask" && node.data.variable ? [node.data.variable] : [],
  );
  const knownVariables = new Set<string>([...BUILT_IN_VARIABLES, ...askVariables]);

  // Playground input
  const [stepId, setStepId] = useState(aiSteps[0]?.id ?? CUSTOM);
  const [customInstructions, setCustomInstructions] = useState(
    "Answer the caller's question, then offer to help further.",
  );
  const [callerMessage, setCallerMessage] = useState(
    "Hi! Do you have anything free on Friday afternoon?",
  );
  const [sampleAnswers, setSampleAnswers] = useState<Record<string, string>>({});
  const instructions =
    aiSteps.find((step) => step.id === stepId)?.instructions ?? customInstructions;
  const answers = Object.fromEntries(Object.entries(sampleAnswers).filter(([, v]) => v.trim()));

  const previewVariables = { ...builtInVariables(prompt, new Date()), ...answers };
  const preview = buildSystemPrompt(prompt, { instructions, variables: previewVariables });
  const promptText = [
    prompt.role,
    prompt.persona,
    prompt.goals,
    prompt.rules,
    ...prompt.examples.flatMap((e) => [e.caller, e.agent]),
  ].join("\n");
  const typos = unknownVariables(promptText, knownVariables);

  const set = <K extends keyof PromptSettings>(key: K, value: PromptSettings[K]) =>
    onChange({ ...prompt, [key]: value });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-gray-200">
      <section className="space-y-4 overflow-y-auto p-6" data-testid="prompt-editor">
        <div>
          <h2 className="text-lg font-semibold">Prompt</h2>
          <p className="text-sm text-gray-500">
            How the AI talks in AI response steps. Saved with the agent&apos;s next version.
          </p>
        </div>

        <TextField
          label="Business name"
          hint="Fills {{business_name}}"
          value={prompt.businessName}
          onChange={(v) => set("businessName", v)}
        />
        <TextArea
          label="Role"
          hint="Who the agent is"
          value={prompt.role}
          onChange={(v) => set("role", v)}
        />
        <TextArea
          label="Personality"
          hint="Tone of voice"
          rows={2}
          value={prompt.persona}
          onChange={(v) => set("persona", v)}
        />
        <TextArea
          label="Goals"
          hint="What a good call achieves"
          rows={2}
          value={prompt.goals}
          onChange={(v) => set("goals", v)}
        />
        <TextArea
          label="Business rules"
          hint="Facts and limits, one per line"
          rows={4}
          placeholder={"A haircut costs £30.\nNever promise refunds."}
          value={prompt.rules}
          onChange={(v) => set("rules", v)}
        />

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Voice style</legend>
          {(Object.keys(VOICE_STYLE_RULES) as (keyof VoiceStyle)[]).map((key) => (
            <label
              key={key}
              className="flex items-start gap-2 text-sm"
              title={VOICE_STYLE_RULES[key].rule}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={prompt.voiceStyle[key]}
                onChange={(event) =>
                  set("voiceStyle", { ...prompt.voiceStyle, [key]: event.target.checked })
                }
              />
              <span>
                {VOICE_STYLE_RULES[key].label}
                <span className="block text-xs text-gray-500">{VOICE_STYLE_RULES[key].rule}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            Example exchanges <span className="font-normal text-gray-500">(few-shot)</span>
          </p>
          {prompt.examples.map((example, index) => (
            <div key={example.id} className="space-y-1 rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                Example {index + 1}
                <button
                  type="button"
                  aria-label={`Remove example ${index + 1}`}
                  className="hover:text-red-600"
                  onClick={() =>
                    set(
                      "examples",
                      prompt.examples.filter((e) => e.id !== example.id),
                    )
                  }
                >
                  ✕
                </button>
              </div>
              {(["caller", "agent"] as const).map((who) => (
                <TextArea
                  key={who}
                  label={`Example ${index + 1}: ${who === "caller" ? "Caller says" : "Agent replies"}`}
                  rows={2}
                  value={example[who]}
                  onChange={(v) =>
                    set(
                      "examples",
                      prompt.examples.map((e) => (e.id === example.id ? { ...e, [who]: v } : e)),
                    )
                  }
                />
              ))}
            </div>
          ))}
          {prompt.examples.length < 10 && (
            <button
              type="button"
              className="text-sm text-blue-600 underline"
              onClick={() =>
                set("examples", [...prompt.examples, { id: newId("ex"), caller: "", agent: "" }])
              }
            >
              + Add example
            </button>
          )}
        </div>

        <div className="text-xs text-gray-600">
          Variables you can use:{" "}
          {[...knownVariables].map((name) => (
            <code key={name} className="mr-1 rounded bg-gray-100 px-1">{`{{${name}}}`}</code>
          ))}
          {typos.length > 0 && (
            <p className="mt-1 text-red-600" data-testid="prompt-typos">
              Unknown: {typos.map((name) => `{{${name}}}`).join(", ")}. Check the spelling.
            </p>
          )}
        </div>

        <details open className="rounded border border-gray-200">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            What the AI receives{" "}
            <span className="font-normal text-gray-500" data-testid="token-estimate">
              ≈ {estimateTokens(preview)} tokens
            </span>
          </summary>
          <pre
            data-testid="prompt-preview"
            className="max-h-96 overflow-y-auto border-t border-gray-200 bg-gray-50 p-3 text-xs whitespace-pre-wrap"
          >
            {preview}
          </pre>
        </details>
      </section>

      <Playground
        prompts={{ a: savedPrompt, b: prompt }}
        savedLabel={savedLabel}
        input={{ instructions, callerMessage, variables: answers }}
        controls={
          <>
            <label className="block text-sm">
              <span className="font-medium">AI response step</span>
              <select
                aria-label="AI response step"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={stepId}
                onChange={(event) => setStepId(event.target.value)}
              >
                {aiSteps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.instructions.slice(0, 80)}
                  </option>
                ))}
                <option value={CUSTOM}>Custom instructions…</option>
              </select>
            </label>
            {stepId === CUSTOM && (
              <TextArea
                label="Custom instructions"
                value={customInstructions}
                onChange={setCustomInstructions}
              />
            )}
            <TextArea label="Caller says" value={callerMessage} onChange={setCallerMessage} />
            {askVariables.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600">
                  Sample answers from earlier in the call (optional)
                </summary>
                <div className="mt-2 space-y-1">
                  {askVariables.map((name) => (
                    <TextField
                      key={name}
                      label={name}
                      value={sampleAnswers[name] ?? ""}
                      onChange={(v) => setSampleAnswers({ ...sampleAnswers, [name]: v })}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        }
      />
    </div>
  );
}

type RunResult =
  | { status: "running" }
  | { status: "done"; reply: string; systemPrompt: string; llm: LlmCallInfo }
  | { status: "error"; message: string };

function Playground({
  prompts,
  savedLabel,
  input,
  controls,
}: {
  prompts: { a: PromptSettings; b: PromptSettings };
  savedLabel: string;
  input: { instructions: string; callerMessage: string; variables: Record<string, string> };
  controls: ReactNode;
}) {
  const { options, problems } = useModelOptions();
  const [modelKey, setModelKey] = useState<string | null>(null);
  const model = modelKey ?? (options[0] ? `${options[0].provider}|${options[0].model}` : "");
  const [results, setResults] = useState<{ a: RunResult; b: RunResult } | null>(null);
  const same = JSON.stringify(prompts.a) === JSON.stringify(prompts.b);
  const running = results?.a.status === "running" || results?.b.status === "running";

  async function runOne(prompt: PromptSettings): Promise<RunResult> {
    const response = await fetch("/api/prompt-playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, model: toModelSpec(model), ...input }),
    });
    const body = (await response.json().catch(() => null)) as {
      reply: string;
      systemPrompt: string;
      llm: LlmCallInfo;
      error?: string;
    } | null;
    if (!response.ok || !body) {
      return { status: "error", message: body?.error ?? `HTTP ${response.status}` };
    }
    return { status: "done", reply: body.reply, systemPrompt: body.systemPrompt, llm: body.llm };
  }

  async function run() {
    setResults({ a: { status: "running" }, b: { status: "running" } });
    // Both at once: same input, same model, only the prompt differs.
    const [a, b] = await Promise.all([runOne(prompts.a), runOne(prompts.b)]);
    setResults({ a, b });
  }

  const columns = [
    { key: "a" as const, title: `A · saved prompt (${savedLabel})` },
    { key: "b" as const, title: same ? "B · same prompt again" : "B · your edits" },
  ];

  return (
    <section className="space-y-4 overflow-y-auto p-6" data-testid="prompt-playground">
      <div>
        <h2 className="text-lg font-semibold">Playground</h2>
        <p className="text-sm text-gray-500">
          Same caller message, same model: only the prompt differs.
          {same && " No edits yet, so A and B show how much replies vary on their own."}
        </p>
      </div>
      {controls}
      <label className="block text-sm">
        <span className="font-medium">Model</span>
        <select
          aria-label="Playground model"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          value={model}
          onChange={(event) => setModelKey(event.target.value)}
        >
          {options.map((option) => (
            <option
              key={`${option.provider}|${option.model}`}
              value={`${option.provider}|${option.model}`}
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {problems.map((problem) => (
        <p key={problem} className="text-xs text-amber-700">
          {problem}
        </p>
      ))}
      <button
        type="button"
        onClick={run}
        disabled={!model || running || !input.callerMessage.trim() || !input.instructions.trim()}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {running ? "Running…" : "Run A vs B"}
      </button>

      {results && (
        <div className="grid grid-cols-2 gap-3">
          {columns.map(({ key, title }) => {
            const result = results[key];
            return (
              <div
                key={key}
                className="space-y-2 rounded border border-gray-200 p-3"
                data-testid={`result-${key}`}
              >
                <h3 className="text-sm font-semibold">{title}</h3>
                {result.status === "running" && <p className="text-sm text-gray-400">…</p>}
                {result.status === "error" && (
                  <p className="text-sm text-red-600">{result.message}</p>
                )}
                {result.status === "done" && (
                  <>
                    <div
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm"
                      data-testid={`reply-${key}`}
                    >
                      {result.reply}
                      <LlmMeta llm={result.llm} />
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs text-gray-600">
                        System prompt ({result.llm.inputTokens ?? "?"} input tokens in total,{" "}
                        {result.llm.costUsd === null
                          ? "cost unknown"
                          : formatCost(result.llm.costUsd)}
                        )
                      </summary>
                      <pre className="mt-1 max-h-64 overflow-y-auto bg-gray-50 p-2 text-[11px] whitespace-pre-wrap">
                        {result.systemPrompt}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Label({ label, hint }: { label: string; hint?: string | undefined }) {
  return (
    <span className="font-medium">
      {label}
      {hint && <span className="ml-1 font-normal text-gray-500">· {hint}</span>}
    </span>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

function TextField({ label, hint, value, placeholder, onChange }: FieldProps) {
  return (
    <label className="block text-sm">
      <Label label={label} hint={hint} />
      <input
        aria-label={label}
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  hint,
  value,
  placeholder,
  onChange,
  rows = 3,
}: FieldProps & { rows?: number }) {
  return (
    <label className="block text-sm">
      <Label label={label} hint={hint} />
      <textarea
        aria-label={label}
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

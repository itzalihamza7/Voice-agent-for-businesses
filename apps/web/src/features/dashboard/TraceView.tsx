import type { TraceEntry } from "@voice-agent/shared";
import { LlmMeta } from "../builder/LlmMeta";

// The trace of a call: every event in order, with its time and, for AI steps, the model, time,
// tokens and cost. What to read when a call went wrong.

function describe(entry: TraceEntry): string {
  const e = entry.event;
  switch (e.type) {
    case "say":
      return `Said: ${e.text}`;
    case "ask":
      return `Asked: ${e.question}`;
    case "answer":
      return `Saved ${e.variable} = "${e.value}" (${e.by})`;
    case "aiResponse":
      return `AI reply: ${e.text ?? "(no model)"}`;
    case "pathChosen":
      return `Path: ${e.label} (${e.by})${e.reason ? `: ${e.reason}` : ""}`;
    case "toolCall":
      return `Tool ${e.toolName}: ${e.ok ? "ok" : e.error}`;
    case "knowledgeLookup":
      return `Knowledge lookup "${e.searchQuery}": ${e.results.length} result(s)`;
    case "guardrail":
      return `Guardrail (${e.kind}): ${e.detail}`;
    case "summary":
      return `Summary updated: ${e.text}`;
    case "memoryLoaded":
    case "memorySaved":
      return `Memory: ${e.facts.join(" ") || "(none)"}`;
    default:
      return "message" in e ? `${e.type}: ${e.message}` : e.type;
  }
}

export function TraceView({ trace }: { trace: TraceEntry[] }) {
  return (
    <ol className="space-y-1 text-xs" data-testid="trace">
      {trace.map((entry, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-14 shrink-0 text-right text-gray-400">
            {(entry.atMs / 1000).toFixed(1)} s
          </span>
          <span>
            {describe(entry)}
            {"llm" in entry.event && entry.event.llm && <LlmMeta llm={entry.event.llm} />}
          </span>
        </li>
      ))}
    </ol>
  );
}

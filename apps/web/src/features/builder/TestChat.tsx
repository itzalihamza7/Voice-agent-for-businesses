"use client";

import type {
  AgentFlow,
  ConversationAction,
  ConversationEvent,
  ConversationState,
  LlmCallInfo,
  AgentTools,
  PromptSettings,
  TurnResult,
} from "@voice-agent/shared";
import { estimateTokens, spokenLines } from "@voice-agent/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  defaultModelChoice,
  ModelPicker,
  toModelSpec,
  useModelOptions,
  type ModelChoice,
} from "./ModelPicker";
import { formatCost, LlmMeta } from "./LlmMeta";
import { useVoice } from "./useVoice";

// Test chat: you play the caller, the server walks the flow. The call is kept on the server as a
// LangGraph thread (POST /api/test-calls, then /api/test-calls/:callId per turn).
// The test uses the flow as it was when "Start test call" was pressed; restart after edits.
// One model can pick Branch paths and another write AI replies (model routing), with a
// fallback for when a model fails. Every AI request shows its model, time, tokens and cost,
// so local and hosted models can be compared.
// Memory & context: a caller number gives the call long-term memory (facts saved at the end of
// the call, shown again next time), and the context budget limits how much of the call each
// AI request sees (older parts are shortened, summarized or left out).

const CONTEXT_BUDGETS = [600, 1200, 2500, 8000];
const DEFAULT_BUDGET = 2500;

type Message =
  | { kind: "agent"; text: string; llm?: LlmCallInfo }
  | { kind: "caller"; text: string }
  | { kind: "note"; text: string; tone: "info" | "data" | "error"; llm?: LlmCallInfo };

interface Props {
  flow: AgentFlow;
  /** The prompt settings on screen (possibly unsaved), used for AI replies. */
  prompt: PromptSettings;
  /** The agent's webhook tools and MCP servers (possibly unsaved). */
  tools: AgentTools;
  onActiveNodeChange: (nodeId: string | null) => void;
  /** The agent and version being tested, for the call log. */
  agentId?: string;
  agentVersion?: number;
}

export function TestChat({
  flow,
  prompt,
  tools,
  onActiveNodeChange,
  agentId,
  agentVersion,
}: Props) {
  const { options, problems } = useModelOptions();
  // Until the user changes it, the default follows the loaded model list.
  const [userChoice, setUserChoice] = useState<ModelChoice | null>(null);
  const choice = userChoice ?? defaultModelChoice(options);
  const [testedFlow, setTestedFlow] = useState<AgentFlow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ConversationState | null>(null);
  const [paths, setPaths] = useState<{ handle: string; label: string }[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callerPhone, setCallerPhone] = useState("");
  const [contextBudget, setContextBudget] = useState(DEFAULT_BUDGET);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // The call lives on the server (a LangGraph thread): starting it returns its id, and every
  // later request sends only what the caller did. Models and prompt edits apply from the next turn.
  const settings = () => ({
    models: {
      decisions: toModelSpec(choice.decisions),
      replies: toModelSpec(choice.replies),
      fallback: toModelSpec(choice.fallback),
    },
    prompt,
    tools,
    contextBudget,
  });

  /** Shows a turn's result: messages, state, paths and the active step. */
  function showResult(result: TurnResult) {
    setMessages((current) => [...current, ...result.events.flatMap(toMessages)]);
    setState(result.state);
    const lastBranch = result.events.findLast((event) => event.type === "branch");
    if (lastBranch?.type === "branch") setPaths(lastBranch.paths);
    // Highlight the step we're waiting at, or the step the call ended on.
    onActiveNodeChange(result.state.nodeId ?? lastNodeId(result.events));
  }

  // Voice: each utterance is sent as audio; the server transcribes it, runs the turn and sends
  // the agent's reply back as speech.
  const voice = useVoice(async (audio) => {
    if (!callId) return null;
    const form = new FormData();
    form.append("audio", audio, "speech.webm");
    form.append("settings", JSON.stringify(settings()));
    const response = await fetch(`/api/test-calls/${callId}/voice`, { method: "POST", body: form });
    const body = (await response.json()) as {
      heard?: string;
      result?: TurnResult;
      audio?: string | null;
      mimeType?: string | null;
      timings?: { sttMs: number; agentMs?: number; ttsMs?: number; totalMs?: number };
      error?: string;
    };
    if (!response.ok || body.error) {
      setMessages((c) => [
        ...c,
        { kind: "note", tone: "error", text: body.error ?? "Voice turn failed." },
      ]);
      return null;
    }
    if (!body.heard) return null;
    setMessages((c) => [...c, { kind: "caller", text: body.heard! }]);
    if (body.result) showResult(body.result);
    const t = body.timings;
    if (t?.totalMs) {
      const s = (ms = 0) => `${(ms / 1000).toFixed(1)} s`;
      setMessages((c) => [
        ...c,
        {
          kind: "note",
          tone: "info",
          text: `🎙️ Speech to text ${s(t.sttMs)} · agent ${s(t.agentMs)} · text to speech ${s(t.ttsMs)} · total ${s(t.totalMs)}`,
        },
      ]);
    }
    if (!body.audio || !body.mimeType) return null;
    const bytes = Uint8Array.from(atob(body.audio), (ch) => ch.charCodeAt(0));
    return new Blob([bytes], { type: body.mimeType });
  });

  /** Speaks the agent's lines (for typed turns and the greeting while voice is on). */
  async function speak(result: TurnResult) {
    const lines = spokenLines(result.events);
    if (voice.status === "off" || lines.length === 0) return;
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: lines.join(" ") }),
    });
    if (response.ok) await voice.play(await response.blob());
  }

  async function send(action: ConversationAction, useFlow: AgentFlow) {
    setPending(true);
    const current = settings();
    const response =
      action.type === "start"
        ? await fetch("/api/test-calls", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...current,
              flow: useFlow,
              ...(agentId ? { agentId } : {}),
              ...(agentVersion ? { agentVersion } : {}),
              ...(action.callerPhone ? { callerPhone: action.callerPhone } : {}),
            }),
          })
        : await fetch(`/api/test-calls/${callId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...current, action }),
          });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const text = body?.error ?? `Request failed (HTTP ${response.status})`;
      setMessages((current) => [...current, { kind: "note", tone: "error", text }]);
      return;
    }
    const result = (await response.json()) as TurnResult & { callId?: string };
    if (result.callId) setCallId(result.callId);
    showResult(result);
    await speak(result);
  }

  function start() {
    setTestedFlow(flow);
    setMessages([]);
    setState(null);
    setInput("");
    const phone = callerPhone.trim();
    setCallId(null);
    void send({ type: "start", ...(phone ? { callerPhone: phone } : {}) }, flow);
  }

  function sendReply(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!testedFlow || !text) return;
    setMessages((current) => [...current, { kind: "caller", text }]);
    setInput("");
    void send({ type: "reply", text }, testedFlow);
  }

  function choosePath(handle: string) {
    if (!testedFlow) return;
    const text = input.trim();
    if (text) setMessages((current) => [...current, { kind: "caller", text }]);
    setInput("");
    void send({ type: "choosePath", handle, ...(text ? { callerText: text } : {}) }, testedFlow);
  }

  async function forgetCaller(phone: string) {
    const response = await fetch(`/api/callers/${encodeURIComponent(phone)}/memory`, {
      method: "DELETE",
    });
    const text =
      response.status === 204
        ? `Forgot everything about ${phone}.`
        : `Nothing was remembered about ${phone}.`;
    setMessages((current) => [...current, { kind: "note", tone: "info", text }]);
    setState((current) => current && { ...current, callerMemory: [] });
  }

  const waitingFor = state?.waitingFor ?? null;
  const aiCalls = messages.flatMap((message) =>
    "llm" in message && message.llm ? [message.llm] : [],
  );

  return (
    <div className="flex h-full flex-col gap-3" data-testid="test-chat">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Test call</h2>
        <button
          type="button"
          onClick={start}
          disabled={pending}
          className="text-sm text-blue-600 underline"
        >
          {testedFlow ? "Restart" : "Start test call"}
        </button>
      </div>
      <ModelPicker options={options} problems={problems} choice={choice} onChange={setUserChoice} />
      <div className="flex items-center gap-2 text-xs" data-testid="voice">
        <button
          type="button"
          onClick={() => (voice.status === "off" ? void voice.start() : voice.stop())}
          className={`rounded border px-2 py-1 ${voice.status === "off" ? "border-gray-300" : "border-rose-500 bg-rose-50 text-rose-700"}`}
        >
          {voice.status === "off" ? "🎙️ Voice off" : "🎙️ Voice on"}
        </button>
        {voice.status !== "off" && (
          <>
            <span className="h-2 w-16 overflow-hidden rounded bg-gray-200">
              <span
                className="block h-full bg-rose-500"
                style={{ width: `${Math.min(100, voice.level * 800)}%` }}
              />
            </span>
            <span className="text-gray-500">{voice.status}…</span>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          <span className="text-gray-600">Caller&apos;s number (memory)</span>
          <input
            aria-label="Caller's number"
            className="mt-0.5 w-full rounded border border-gray-300 px-1 py-0.5"
            placeholder="none: no memory"
            value={callerPhone}
            onChange={(event) => setCallerPhone(event.target.value)}
          />
        </label>
        <label>
          <span className="text-gray-600">Context budget</span>
          <select
            aria-label="Context budget"
            className="mt-0.5 w-full rounded border border-gray-300 px-1 py-0.5"
            value={contextBudget}
            onChange={(event) => setContextBudget(Number(event.target.value))}
          >
            {CONTEXT_BUDGETS.map((budget) => (
              <option key={budget} value={budget}>
                {budget.toLocaleString()} tokens{budget === DEFAULT_BUDGET ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500">
        You play the caller. Uses the flow on the canvas, saved or not. Models can be changed
        mid-call.
      </p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        {pending && <p className="text-xs text-gray-400">…</p>}
        <div ref={endRef} />
      </div>

      {waitingFor && !pending && (
        <div className="space-y-2 border-t border-gray-200 pt-3">
          {waitingFor === "path" ? (
            <>
              <input
                aria-label="What the caller says (optional)"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="What the caller says (optional)…"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <p className="text-xs font-medium text-gray-600">Which path does the call take?</p>
              {paths.map((path, index) => (
                <button
                  key={path.handle}
                  type="button"
                  onClick={() => choosePath(path.handle)}
                  className="block w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-left text-sm hover:bg-amber-100"
                >
                  {path.label === "Otherwise" ? "Otherwise" : `${index + 1}. ${path.label}`}
                </button>
              ))}
            </>
          ) : (
            <form onSubmit={sendReply} className="flex gap-2">
              <input
                aria-label="Caller's answer"
                autoFocus
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder={
                  waitingFor === "callerMessage"
                    ? "What does the caller say? The AI picks the path…"
                    : "Type the caller's answer…"
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}
        </div>
      )}

      {aiCalls.length > 0 && (
        <p className="text-xs text-gray-500" data-testid="ai-totals">
          AI: {aiCalls.length} request(s) ·{" "}
          {(aiCalls.reduce((sum, call) => sum + call.latencyMs, 0) / 1000).toFixed(1)} s ·{" "}
          {aiCalls.reduce(
            (sum, call) => sum + (call.inputTokens ?? 0) + (call.outputTokens ?? 0),
            0,
          )}{" "}
          tokens · {formatCost(aiCalls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0))}
        </p>
      )}

      {state && <ContextMeter state={state} budget={contextBudget} />}

      {state?.callerPhone && (
        <div className="border-t border-gray-200 pt-2 text-xs" data-testid="caller-memory">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-gray-600">Remembered about {state.callerPhone}</h3>
            <button
              type="button"
              className="text-red-600 underline"
              onClick={() => void forgetCaller(state.callerPhone!)}
            >
              Forget this caller
            </button>
          </div>
          {state.callerMemory.length ? (
            <ul className="mt-1 list-disc pl-4">
              {state.callerMemory.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-gray-500">Nothing yet: facts are saved when the call ends.</p>
          )}
        </div>
      )}

      {state && Object.keys(state.variables).length > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <h3 className="text-xs font-semibold text-gray-600">Collected answers</h3>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs" data-testid="variables">
            {Object.entries(state.variables).map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="font-mono text-gray-500">{name}</dt>
                <dd className="truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** How much of the call the next AI request would see, before any cuts. */
function ContextMeter({ state, budget }: { state: ConversationState; budget: number }) {
  const recent = state.transcript.slice(state.summary?.upTo ?? 0);
  const tokens =
    (state.summary ? estimateTokens(state.summary.text) : 0) +
    recent.reduce((sum, entry) => sum + estimateTokens(entry.text), 0);
  const over = tokens > budget;
  return (
    <p
      className={`text-xs ${over ? "text-amber-700" : "text-gray-500"}`}
      data-testid="context-meter"
    >
      Context: ~{tokens.toLocaleString()} of {budget.toLocaleString()} tokens
      {state.summary
        ? ` · summary covers ${state.summary.upTo} of ${state.transcript.length} messages`
        : ""}
      {over ? " · next AI request will be shortened" : ""}
    </p>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.kind === "note") {
    const tone = { info: "text-gray-500", data: "text-indigo-600", error: "text-red-600" }[
      message.tone
    ];
    return (
      <p className={`text-xs italic ${tone}`}>
        {message.text}
        {message.llm && <LlmMeta llm={message.llm} />}
      </p>
    );
  }
  const isAgent = message.kind === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        data-testid={`${message.kind}-message`}
        className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
          isAgent ? "bg-gray-100 text-gray-900" : "bg-blue-600 text-white"
        }`}
      >
        {message.text}
        {message.kind === "agent" && message.llm && <LlmMeta llm={message.llm} />}
      </div>
    </div>
  );
}

function toMessages(event: ConversationEvent): Message[] {
  const note = (text: string, tone: "info" | "data" | "error" = "info"): Message => ({
    kind: "note",
    text,
    tone,
  });
  switch (event.type) {
    case "say":
      return [{ kind: "agent", text: event.text }];
    case "ask":
      return [{ kind: "agent", text: event.question }];
    case "answer": {
      const how = {
        text: "",
        rules: " (understood by rules)",
        ai: " (understood by AI)",
        gaveUp: " (not understood after 2 tries: kept as said)",
      }[event.by];
      return [
        {
          kind: "note",
          tone: event.by === "gaveUp" ? "error" : "data",
          text: `Saved ${event.variable} = "${event.value}"${how}`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
      ];
    }
    case "reask":
      return [
        {
          kind: "note",
          tone: "error",
          text: `Not understood: ${event.reason}`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
        { kind: "agent", text: event.question },
      ];
    case "aiResponse":
      return event.text !== null
        ? [{ kind: "agent", text: event.text, ...(event.llm ? { llm: event.llm } : {}) }]
        : [
            note(
              `AI response (choose an AI model to hear it). Instructions: "${event.instructions}"`,
            ),
          ];
    case "toolCall": {
      const who = event.by === "ai" ? "AI called" : "Tool";
      const outcome = event.ok ? `→ ${short(event.result)}` : `failed: ${event.error ?? ""}`;
      const filled = event.filledByAi?.length
        ? ` (AI filled in: ${event.filledByAi.join(", ")})`
        : "";
      return [
        {
          kind: "note",
          tone: event.ok ? "data" : "error",
          text: `🔧 ${who} ${event.toolName}(${short(event.arguments)}) ${outcome}${filled} · ${event.latencyMs} ms`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
      ];
    }
    case "knowledgeLookup": {
      if (event.error) return [note(`📚 Knowledge lookup failed: ${event.error}`, "error")];
      const sources = event.results.length
        ? event.results
            .map((r, i) => `[${i + 1}] ${r.documentTitle}${r.heading ? ` › ${r.heading}` : ""}`)
            .join("  ")
        : "nothing relevant found";
      const rewritten =
        event.searchQuery !== event.query ? ` (searched "${event.searchQuery}")` : "";
      return [
        {
          kind: "note",
          tone: event.results.length ? "data" : "error",
          text: `📚 Knowledge${rewritten}: ${sources} · ${event.latencyMs} ms`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
      ];
    }
    case "branch":
      return [];
    case "pathChosen": {
      if (event.by === "you") return [note(`→ ${event.label}`)];
      if (event.by === "keywords") return [note(`→ Keywords chose: ${event.label}`)];
      if (event.by === "rule")
        return [note(`→ Rule chose: ${event.label} (${event.reason ?? ""})`)];
      const reason = event.reason ? ` Reason: "${event.reason.trim()}"` : "";
      const keywords =
        event.keywordGuess !== undefined
          ? ` Keywords would have chosen: ${event.keywordGuess}${event.keywordGuess === event.label ? " (same)" : ""}.`
          : "";
      return [
        {
          kind: "note",
          tone: "info",
          text: `→ AI chose: ${event.label}.${reason}${keywords}`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
      ];
    }
    case "contextCut": {
      const what = [
        event.notesShortened ? `${event.notesShortened} earlier note(s) shortened` : "",
        event.messagesDropped ? `${event.messagesDropped} oldest message(s) left out` : "",
      ].filter(Boolean);
      return [
        note(
          `✂️ Context over budget: ~${event.tokensBefore} → ~${event.tokensAfter} tokens (${what.join(", ")})`,
        ),
      ];
    }
    case "summary":
      return [
        {
          kind: "note",
          tone: "data",
          text: `📝 Summary updated (+${event.added} messages): ${event.text}`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
      ];
    case "memoryLoaded":
      return [
        note(
          event.facts.length
            ? `🧠 Returning caller ${event.phoneNumber} (${event.callCount} earlier call(s)): ${event.facts.join(" ")}`
            : `🧠 New caller ${event.phoneNumber}: nothing remembered yet.`,
          "data",
        ),
      ];
    case "memorySaved":
      return [
        {
          kind: "note",
          tone: "data",
          text: `🧠 Memory saved for ${event.phoneNumber}: ${event.facts.join(" ") || "(nothing to remember)"}`,
          ...(event.llm ? { llm: event.llm } : {}),
        },
      ];
    case "memoryError":
      return [note(`🧠 Memory for ${event.phoneNumber} not updated: ${event.message}`, "error")];
    case "guardrail": {
      const label = {
        redacted: "Privacy",
        injection: "Injection attempt",
        escalation: "Escalation",
        ungrounded: "Not grounded",
        policy: "Policy",
      }[event.kind];
      const stopped = event.original ? ` Stopped reply: "${event.original}"` : "";
      return [note(`🛡️ ${label}: ${event.detail}${stopped}`, "error")];
    }
    case "note":
      return [note(event.message)];
    case "llmError":
      return [note(`AI error: ${event.message}`, "error")];
    case "transfer":
      return [
        ...(event.message ? [{ kind: "agent" as const, text: event.message }] : []),
        note(`Call transferred to ${event.phoneNumber}.`),
      ];
    case "end":
      return [
        ...(event.message ? [{ kind: "agent" as const, text: event.message }] : []),
        note("Call ended."),
      ];
    case "stuck":
      return [note(event.message, "error")];
  }
}

function lastNodeId(events: ConversationEvent[]): string | null {
  for (const event of [...events].reverse()) {
    if ("nodeId" in event && event.nodeId) return event.nodeId;
  }
  return null;
}

/** Compact JSON for the chat, cut off when long. */
function short(value: unknown): string {
  const text = JSON.stringify(value ?? {});
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

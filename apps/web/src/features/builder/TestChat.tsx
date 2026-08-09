"use client";

import type {
  AgentFlow,
  ConversationAction,
  ConversationEvent,
  ConversationState,
  LlmCallInfo,
  TurnResult,
} from "@voice-agent/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  defaultModelChoice,
  ModelPicker,
  toModelSpec,
  useModelOptions,
  type ModelChoice,
} from "./ModelPicker";

// Test chat: you play the caller, the server walks the flow (POST /api/simulate).
// The test uses the flow as it was when "Start test call" was pressed; restart after edits.
// One model can pick Branch paths and another write AI replies (model routing), with a
// fallback for when a model fails. Every AI request shows its model, time, tokens and cost,
// so local and hosted models can be compared.

type Message =
  | { kind: "agent"; text: string; llm?: LlmCallInfo }
  | { kind: "caller"; text: string }
  | { kind: "note"; text: string; tone: "info" | "data" | "error"; llm?: LlmCallInfo };

interface Props {
  flow: AgentFlow;
  onActiveNodeChange: (nodeId: string | null) => void;
}

export function TestChat({ flow, onActiveNodeChange }: Props) {
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(
    action: ConversationAction,
    useFlow: AgentFlow,
    from: ConversationState | null,
  ) {
    setPending(true);
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flow: useFlow,
        state: from,
        action,
        models: {
          decisions: toModelSpec(choice.decisions),
          replies: toModelSpec(choice.replies),
          fallback: toModelSpec(choice.fallback),
        },
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const text = body?.error ?? `Request failed (HTTP ${response.status})`;
      setMessages((current) => [...current, { kind: "note", tone: "error", text }]);
      return;
    }
    const result = (await response.json()) as TurnResult;
    setMessages((current) => [...current, ...result.events.flatMap(toMessages)]);
    setState(result.state);
    const lastBranch = result.events.findLast((event) => event.type === "branch");
    if (lastBranch?.type === "branch") setPaths(lastBranch.paths);
    // Highlight the step we're waiting at, or the step the call ended on.
    onActiveNodeChange(result.state.nodeId ?? lastNodeId(result.events));
  }

  function start() {
    setTestedFlow(flow);
    setMessages([]);
    setState(null);
    setInput("");
    void send({ type: "start" }, flow, null);
  }

  function sendReply(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!testedFlow || !text) return;
    setMessages((current) => [...current, { kind: "caller", text }]);
    setInput("");
    void send({ type: "reply", text }, testedFlow, state);
  }

  function choosePath(handle: string) {
    if (!testedFlow) return;
    const text = input.trim();
    if (text) setMessages((current) => [...current, { kind: "caller", text }]);
    setInput("");
    void send(
      { type: "choosePath", handle, ...(text ? { callerText: text } : {}) },
      testedFlow,
      state,
    );
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

function LlmMeta({ llm }: { llm: LlmCallInfo }) {
  const parts = [llm.model, `${(llm.latencyMs / 1000).toFixed(1)} s`];
  if (llm.inputTokens !== null) {
    const cached = llm.cachedInputTokens ? ` (${llm.cachedInputTokens} cached)` : "";
    parts.push(`${llm.inputTokens}→${llm.outputTokens ?? 0} tokens${cached}`);
  }
  parts.push(llm.costUsd === null ? "cost unknown" : formatCost(llm.costUsd));
  return (
    <span className="block text-[10px] text-gray-400 not-italic" data-testid="llm-meta">
      {parts.join(" · ")}
      {llm.fellBackFrom && (
        <span className="block text-amber-600" data-testid="fallback-note">
          Fallback: {llm.fellBackFrom.model} failed ({llm.fellBackFrom.error})
        </span>
      )}
    </span>
  );
}

/** Tiny amounts need more digits: one reply often costs a fraction of a cent. */
function formatCost(usd: number): string {
  if (usd === 0) return "$0 (local)";
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(2)}`;
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
    case "answer":
      return [note(`Saved ${event.variable} = "${event.value}"`, "data")];
    case "aiResponse":
      return event.text !== null
        ? [{ kind: "agent", text: event.text, ...(event.llm ? { llm: event.llm } : {}) }]
        : [
            note(
              `AI response (choose an AI model to hear it). Instructions: "${event.instructions}"`,
            ),
          ];
    case "tool":
      return [note(`Tool call: ${event.toolName} (tools are connected in roadmap phase 5)`)];
    case "knowledgeLookup":
      return [note(`Knowledge lookup: "${event.query}" (knowledge base comes in phase 6)`)];
    case "branch":
      return [];
    case "pathChosen":
      return event.by === "ai"
        ? [
            {
              kind: "note",
              tone: "info",
              text: `→ AI chose: ${event.label} (answered "${event.aiAnswer ?? ""}")`,
              ...(event.llm ? { llm: event.llm } : {}),
            },
          ]
        : [note(`→ ${event.label}`)];
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
    if (event.nodeId) return event.nodeId;
  }
  return null;
}

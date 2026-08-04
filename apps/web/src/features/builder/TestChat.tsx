"use client";

import type {
  AgentFlow,
  ConversationAction,
  ConversationEvent,
  ConversationState,
  TurnResult,
} from "@voice-agent/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";

// Test chat: you play the caller, the server walks the flow (POST /api/simulate).
// The test uses the flow as it was when "Start test call" was pressed; restart after edits.
// Branch paths are picked by hand for now: an LLM will choose them in the next step.

type Message =
  | { kind: "agent" | "caller"; text: string }
  | { kind: "note"; text: string; tone: "info" | "data" | "error" };

type Waiting = { kind: "answer" } | { kind: "path"; paths: { handle: string; label: string }[] };

interface Props {
  flow: AgentFlow;
  onActiveNodeChange: (nodeId: string | null) => void;
}

export function TestChat({ flow, onActiveNodeChange }: Props) {
  const [testedFlow, setTestedFlow] = useState<AgentFlow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<ConversationState | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
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
      body: JSON.stringify({ flow: useFlow, state: from, action }),
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
    setWaiting(waitingFor(result));
    // Highlight the step we're waiting at, or the step the call ended on.
    onActiveNodeChange(result.state.nodeId ?? lastNodeId(result.events));
  }

  function start() {
    setTestedFlow(flow);
    setMessages([]);
    setInput("");
    void send({ type: "start" }, flow, null);
  }

  function sendAnswer(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!testedFlow || !text) return;
    setMessages((current) => [...current, { kind: "caller", text }]);
    setInput("");
    void send({ type: "answer", text }, testedFlow, state);
  }

  function choosePath(handle: string) {
    if (!testedFlow) return;
    // What the caller said is optional here: without an LLM it doesn't affect the path yet.
    const text = input.trim();
    if (text) setMessages((current) => [...current, { kind: "caller", text }]);
    setInput("");
    void send({ type: "choosePath", handle }, testedFlow, state);
  }

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
      <p className="text-xs text-gray-500">
        You play the caller. Uses the flow on the canvas, saved or not.
      </p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
        {pending && <p className="text-xs text-gray-400">…</p>}
        <div ref={endRef} />
      </div>

      {waiting && !pending && (
        <div className="space-y-2 border-t border-gray-200 pt-3">
          {waiting.kind === "answer" ? (
            <form onSubmit={sendAnswer} className="flex gap-2">
              <input
                aria-label="Caller's answer"
                autoFocus
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="Type what the caller says…"
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
          ) : (
            <>
              <input
                aria-label="What the caller says (optional)"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="What the caller says (optional)…"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <p className="text-xs font-medium text-gray-600">Which path does the call take?</p>
              {waiting.paths.map((path, index) => (
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

function MessageBubble({ message }: { message: Message }) {
  if (message.kind === "note") {
    const tone = {
      info: "text-gray-500",
      data: "text-indigo-600",
      error: "text-red-600",
    }[message.tone];
    return <p className={`text-xs italic ${tone}`}>{message.text}</p>;
  }
  const isAgent = message.kind === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <p
        data-testid={`${message.kind}-message`}
        className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
          isAgent ? "bg-gray-100 text-gray-900" : "bg-blue-600 text-white"
        }`}
      >
        {message.text}
      </p>
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
      return [
        note(
          `AI response: an LLM will write this reply (next step). Instructions: "${event.instructions}"`,
        ),
      ];
    case "tool":
      return [note(`Tool call: ${event.toolName} (tools are connected in roadmap phase 5)`)];
    case "knowledgeLookup":
      return [note(`Knowledge lookup: "${event.query}" (knowledge base comes in phase 6)`)];
    case "branch":
      return [note("Branch: pick the path the call takes below.")];
    case "pathChosen":
      return [note(`→ ${event.label}`)];
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

function waitingFor(result: TurnResult): Waiting | null {
  const last = result.events.at(-1);
  if (result.state.nodeId === null || !last) return null;
  if (last.type === "branch") return { kind: "path", paths: last.paths };
  return { kind: "answer" };
}

function lastNodeId(events: ConversationEvent[]): string | null {
  for (const event of [...events].reverse()) {
    if (event.nodeId) return event.nodeId;
  }
  return null;
}

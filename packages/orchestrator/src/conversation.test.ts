import type { ChatMessage, CompletionResult, LanguageModelProvider } from "@voice-agent/pipeline";
import { LanguageModelError } from "@voice-agent/pipeline";
import type { AgentFlow, ConversationState, FlowNode } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { ConversationError, runTurn } from "./conversation";
import { parseBranchAnswer } from "./prompts";

const at = { x: 0, y: 0 };
function node(id: string, type: FlowNode["type"], data: object): FlowNode {
  return { id, type, position: at, data } as FlowNode;
}

// Start → greet → intent (book? / otherwise) ; book: ask name → check tool → slot (free? / otherwise)
//   free → confirm → bye ; otherwise → offer (AI) → bye ; intent otherwise → human (transfer)
const flow: AgentFlow = {
  nodes: [
    node("start", "start", {}),
    node("greet", "say", { text: "Hello! How can I help?" }),
    node("intent", "branch", { conditions: [{ id: "c-book", label: "Wants to book" }] }),
    node("ask-name", "ask", { question: "Your name?", variable: "caller_name" }),
    node("check", "tool", { toolName: "checkAvailability" }),
    node("slot", "branch", { conditions: [{ id: "c-free", label: "Time is free" }] }),
    node("confirm", "say", { text: "Booked for {{caller_name}}." }),
    node("offer", "aiResponse", { instructions: "Offer other times." }),
    node("bye", "end", { message: "Bye {{caller_name}}!" }),
    node("human", "transfer", { phoneNumber: "+14155550100", message: "Transferring you." }),
  ],
  edges: [
    { id: "e1", source: "start", target: "greet" },
    { id: "e2", source: "greet", target: "intent" },
    { id: "e3", source: "intent", target: "ask-name", sourceHandle: "c-book" },
    { id: "e4", source: "intent", target: "human", sourceHandle: "else" },
    { id: "e5", source: "ask-name", target: "check" },
    { id: "e6", source: "check", target: "slot" },
    { id: "e7", source: "slot", target: "confirm", sourceHandle: "c-free" },
    { id: "e8", source: "slot", target: "offer", sourceHandle: "else" },
    { id: "e9", source: "confirm", target: "bye" },
    { id: "e10", source: "offer", target: "bye" },
  ],
};

/** A fake language model that answers from a script and records what it was asked. */
function scriptedLlm(answers: (string | Error)[]) {
  const prompts: ChatMessage[][] = [];
  const llm: LanguageModelProvider = {
    name: "scripted",
    model: "fake-1",
    async complete(messages): Promise<CompletionResult> {
      prompts.push(messages);
      const answer = answers.shift();
      if (answer === undefined) throw new Error("scripted LLM ran out of answers");
      if (answer instanceof Error) throw answer;
      return {
        text: answer,
        model: "fake-1",
        latencyMs: 5,
        usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 },
        costUsd: 0.0001,
      };
    },
  };
  return { llm, prompts };
}

const noAi = { decisions: null, replies: null };

describe("runTurn without AI", () => {
  it("runs the booking path, with Branch paths picked by hand", async () => {
    const first = await runTurn(flow, null, { type: "start" }, noAi);
    expect(first.events.map((e) => e.type)).toEqual(["say", "branch"]);
    expect(first.state).toMatchObject({ nodeId: "intent", waitingFor: "path" });

    const second = await runTurn(
      flow,
      first.state,
      { type: "choosePath", handle: "c-book", callerText: "I want to book" },
      noAi,
    );
    expect(second.events).toEqual([
      { type: "pathChosen", nodeId: "intent", label: "Wants to book", by: "you" },
      { type: "ask", nodeId: "ask-name", question: "Your name?", variable: "caller_name" },
    ]);
    expect(second.state.waitingFor).toBe("answer");

    const third = await runTurn(flow, second.state, { type: "reply", text: "Ali" }, noAi);
    expect(third.events.map((e) => e.type)).toEqual(["answer", "tool", "branch"]);

    const fourth = await runTurn(flow, third.state, { type: "choosePath", handle: "c-free" }, noAi);
    expect(fourth.events.slice(1)).toEqual([
      { type: "say", nodeId: "confirm", text: "Booked for Ali." },
      { type: "end", nodeId: "bye", message: "Bye Ali!" },
    ]);
    expect(fourth.state).toMatchObject({
      nodeId: null,
      waitingFor: null,
      variables: { caller_name: "Ali" },
    });
    expect(fourth.state.transcript.map((t) => `${t.role}: ${t.text}`)).toEqual([
      "agent: Hello! How can I help?",
      "caller: I want to book",
      "agent: Your name?",
      "caller: Ali",
      "system: The tool \"checkAvailability\" was called but returned NO RESULT (tools aren't connected yet). Nothing it would have returned is known, so don't state any of it.",
      "agent: Booked for Ali.",
      "agent: Bye Ali!",
    ]);
  });

  it("only reports AI response steps", async () => {
    const start = await runTurn(flow, null, { type: "start" }, noAi);
    const asked = await runTurn(flow, start.state, { type: "choosePath", handle: "c-book" }, noAi);
    const atSlot = await runTurn(flow, asked.state, { type: "reply", text: "Ali" }, noAi);
    const result = await runTurn(flow, atSlot.state, { type: "choosePath", handle: "else" }, noAi);
    expect(result.events[1]).toEqual({
      type: "aiResponse",
      nodeId: "offer",
      instructions: "Offer other times.",
      text: null,
    });
  });

  it("takes the Otherwise path to a transfer, which ends the call", async () => {
    const first = await runTurn(flow, null, { type: "start" }, noAi);
    const result = await runTurn(flow, first.state, { type: "choosePath", handle: "else" }, noAi);
    expect(result.events.at(-1)).toMatchObject({ type: "transfer", phoneNumber: "+14155550100" });
    expect(result.state.nodeId).toBeNull();
  });
});

describe("runTurn with AI", () => {
  it("waits for the caller at a Branch, then lets the AI choose the path", async () => {
    const { llm, prompts } = scriptedLlm(["1"]);
    const first = await runTurn(flow, null, { type: "start" }, { decisions: llm, replies: llm });
    expect(first.state).toMatchObject({ nodeId: "intent", waitingFor: "callerMessage" });

    const second = await runTurn(
      flow,
      first.state,
      { type: "reply", text: "I'd like an appointment" },
      { decisions: llm, replies: llm },
    );
    expect(second.events[0]).toEqual({
      type: "pathChosen",
      nodeId: "intent",
      label: "Wants to book",
      by: "ai",
      aiAnswer: "1",
      llm: {
        model: "fake-1",
        latencyMs: 5,
        inputTokens: 10,
        outputTokens: 2,
        cachedInputTokens: 0,
        costUsd: 0.0001,
      },
    });
    expect(second.state.nodeId).toBe("ask-name");
    // The AI saw the paths and the caller's words.
    expect(prompts[0]![0]!.content).toContain("1. Wants to book");
    expect(prompts[0]![1]!.content).toContain("Caller: I'd like an appointment");
  });

  it("takes Otherwise when the AI answers 0 or something unreadable", async () => {
    for (const answer of ["0", "I am not sure"]) {
      const { llm } = scriptedLlm([answer]);
      const first = await runTurn(flow, null, { type: "start" }, { decisions: llm, replies: llm });
      const result = await runTurn(
        flow,
        first.state,
        { type: "reply", text: "What's the weather?" },
        { decisions: llm, replies: llm },
      );
      expect(result.events[0]).toMatchObject({ type: "pathChosen", label: "Otherwise", by: "ai" });
      expect(result.events.at(-1)?.type).toBe("transfer");
    }
  });

  it("asks for a hand-picked path after a Tool, because tool results don't exist yet", async () => {
    const { llm } = scriptedLlm(["1"]);
    const first = await runTurn(flow, null, { type: "start" }, { decisions: llm, replies: llm });
    const asked = await runTurn(
      flow,
      first.state,
      { type: "reply", text: "Book please" },
      { decisions: llm, replies: llm },
    );
    const atSlot = await runTurn(
      flow,
      asked.state,
      { type: "reply", text: "Ali" },
      { decisions: llm, replies: llm },
    );
    expect(atSlot.state).toMatchObject({ nodeId: "slot", waitingFor: "path" });
    expect(atSlot.events.at(-1)?.type).toBe("note");
  });

  it("writes AI response steps with the language model and adds them to the transcript", async () => {
    const { llm, prompts } = scriptedLlm(["1", "Sorry, that time is taken. How about Monday?"]);
    const first = await runTurn(flow, null, { type: "start" }, { decisions: llm, replies: llm });
    const asked = await runTurn(
      flow,
      first.state,
      { type: "reply", text: "Book please" },
      { decisions: llm, replies: llm },
    );
    const atSlot = await runTurn(
      flow,
      asked.state,
      { type: "reply", text: "Ali" },
      { decisions: llm, replies: llm },
    );
    const result = await runTurn(
      flow,
      atSlot.state,
      { type: "choosePath", handle: "else" },
      { decisions: llm, replies: llm },
    );

    expect(result.events[1]).toMatchObject({
      type: "aiResponse",
      text: "Sorry, that time is taken. How about Monday?",
      llm: { model: "fake-1" },
    });
    expect(result.state.transcript.at(-2)).toEqual({
      role: "agent",
      text: "Sorry, that time is taken. How about Monday?",
    });
    const [system, conversation] = prompts[1]!;
    expect(system!.content).toContain("Your task for this step: Offer other times.");
    expect(system!.content).toContain("- caller_name: Ali");
    // The whole conversation, tool note included, is one transcript in one user message.
    expect(prompts[1]).toHaveLength(2);
    expect(conversation!.role).toBe("user");
    expect(conversation!.content).toContain("Caller: Ali\nNote: The tool");
  });

  it("falls back to picking by hand when the AI fails at a Branch", async () => {
    const { llm } = scriptedLlm([new LanguageModelError("ollama failed after 3 attempts")]);
    const first = await runTurn(flow, null, { type: "start" }, { decisions: llm, replies: llm });
    const result = await runTurn(
      flow,
      first.state,
      { type: "reply", text: "Book please" },
      { decisions: llm, replies: llm },
    );
    expect(result.events.map((e) => e.type)).toEqual(["llmError", "note"]);
    expect(result.state).toMatchObject({ nodeId: "intent", waitingFor: "path" });
  });
});

describe("runTurn model routing", () => {
  it("sends Branch decisions and AI replies to their own models", async () => {
    const decider = scriptedLlm(["1"]);
    const writer = scriptedLlm(["Sorry, that time is taken."]);
    const deps = { decisions: decider.llm, replies: writer.llm };
    const first = await runTurn(flow, null, { type: "start" }, deps);
    const asked = await runTurn(flow, first.state, { type: "reply", text: "Book please" }, deps);
    const atSlot = await runTurn(flow, asked.state, { type: "reply", text: "Ali" }, deps);
    await runTurn(flow, atSlot.state, { type: "choosePath", handle: "else" }, deps);

    expect(decider.prompts).toHaveLength(1);
    expect(decider.prompts[0]![0]!.content).toContain("You route a phone call");
    expect(writer.prompts).toHaveLength(1);
    expect(writer.prompts[0]![0]!.content).toContain("Your task for this step");
  });

  it("can write AI replies while Branch paths are still picked by hand", async () => {
    const writer = scriptedLlm([]);
    const first = await runTurn(
      flow,
      null,
      { type: "start" },
      { decisions: null, replies: writer.llm },
    );
    expect(first.state.waitingFor).toBe("path");
  });
});

describe("runTurn errors", () => {
  it("rejects actions that don't fit the current step", async () => {
    const base = { variables: {}, transcript: [] };
    const atBranch: ConversationState = { ...base, nodeId: "intent", waitingFor: "path" };
    const atAsk: ConversationState = { ...base, nodeId: "ask-name", waitingFor: "answer" };
    const over: ConversationState = { ...base, nodeId: null, waitingFor: null };

    await expect(runTurn(flow, atBranch, { type: "reply", text: "hi" }, noAi)).rejects.toThrow(
      ConversationError,
    );
    await expect(
      runTurn(flow, atAsk, { type: "choosePath", handle: "else" }, noAi),
    ).rejects.toThrow(ConversationError);
    await expect(
      runTurn(flow, atBranch, { type: "choosePath", handle: "nope" }, noAi),
    ).rejects.toThrow(ConversationError);
    await expect(runTurn(flow, over, { type: "reply", text: "hi" }, noAi)).rejects.toThrow(
      "already over",
    );
  });

  it("stops with an explanation when a step has nothing after it, or the flow loops", async () => {
    const deadEnd: AgentFlow = {
      nodes: [node("start", "start", {}), node("hi", "say", { text: "Hi" })],
      edges: [{ id: "e", source: "start", target: "hi" }],
    };
    expect((await runTurn(deadEnd, null, { type: "start" }, noAi)).events.at(-1)).toMatchObject({
      type: "stuck",
      nodeId: "hi",
    });

    const loop: AgentFlow = {
      nodes: [
        node("start", "start", {}),
        node("a", "say", { text: "a" }),
        node("b", "say", { text: "b" }),
      ],
      edges: [
        { id: "e1", source: "start", target: "a" },
        { id: "e2", source: "a", target: "b" },
        { id: "e3", source: "b", target: "a" },
      ],
    };
    const looped = await runTurn(loop, null, { type: "start" }, noAi);
    expect(looped.events.at(-1)?.type).toBe("stuck");
    expect(looped.state.nodeId).toBeNull();
  });

  it("reports a flow without a Start step", async () => {
    const result = await runTurn({ nodes: [], edges: [] }, null, { type: "start" }, noAi);
    expect(result.events).toEqual([{ type: "stuck", message: "The flow has no Start step." }]);
  });
});

describe("parseBranchAnswer", () => {
  it("reads the first number within range", () => {
    expect(parseBranchAnswer("2", 3)).toBe(2);
    expect(parseBranchAnswer("Path 3.", 3)).toBe(3);
    expect(parseBranchAnswer("0", 3)).toBeNull();
    expect(parseBranchAnswer("7", 3)).toBeNull();
    expect(parseBranchAnswer("book it", 3)).toBeNull();
  });
});

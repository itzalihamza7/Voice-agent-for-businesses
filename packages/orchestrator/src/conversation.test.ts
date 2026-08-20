import type { ChatMessage, CompletionResult, LanguageModelProvider } from "@voice-agent/pipeline";
import { LanguageModelError } from "@voice-agent/pipeline";
import {
  DEFAULT_PROMPT_SETTINGS,
  FlowNodeSchema,
  type AgentFlow,
  type ConversationState,
  type FlowNode,
} from "@voice-agent/shared";
import type { Tool } from "@voice-agent/tools";
import { describe, expect, it } from "vitest";
import { ConversationError, runTurn } from "./conversation";
import { parseBranchAnswer } from "./prompts";

const at = { x: 0, y: 0 };
// Through the schema, like real flows, so defaults (e.g. answerType, keywords) are filled in.
function node(id: string, type: FlowNode["type"], data: object): FlowNode {
  return FlowNodeSchema.parse({ id, type, position: at, data });
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

/** A fake checkAvailability tool that always says the time is free. */
const tools = new Map<string, Tool>([
  [
    "checkAvailability",
    {
      name: "checkAvailability",
      description: "Free times",
      parameters: { type: "object", properties: {} },
      source: "builtin",
      execute: async () => ({ ok: true, data: { free: true } }),
    },
  ],
]);

describe("runTurn without AI", () => {
  it("runs the booking path, with Branch paths picked by hand", async () => {
    const deps = { ...noAi, tools };
    const first = await runTurn(flow, null, { type: "start" }, deps);
    expect(first.events.map((e) => e.type)).toEqual(["say", "branch"]);
    expect(first.state).toMatchObject({ nodeId: "intent", waitingFor: "path" });

    const second = await runTurn(
      flow,
      first.state,
      { type: "choosePath", handle: "c-book", callerText: "I want to book" },
      deps,
    );
    expect(second.events).toEqual([
      { type: "pathChosen", nodeId: "intent", label: "Wants to book", by: "you" },
      { type: "ask", nodeId: "ask-name", question: "Your name?", variable: "caller_name" },
    ]);

    // The tool runs; without AI, the Branch after it is picked by hand.
    const third = await runTurn(flow, second.state, { type: "reply", text: "Ali" }, deps);
    expect(third.events.map((e) => e.type)).toEqual(["answer", "toolCall", "branch"]);
    expect(third.events[1]).toMatchObject({
      toolName: "checkAvailability",
      by: "step",
      ok: true,
      result: { free: true },
    });
    expect(third.state.waitingFor).toBe("path");

    const fourth = await runTurn(flow, third.state, { type: "choosePath", handle: "c-free" }, deps);
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
      'system: The tool "checkAvailability" was called with {} and returned: {"free":true}',
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
    expect(prompts[0]![0]!.content).toContain("- Wants to book");
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

  it("decides a Branch right after a Tool from the tool's result, without waiting for the caller", async () => {
    const { llm, prompts } = scriptedLlm([
      "1",
      JSON.stringify({ reason: "the time is free", path: "Time is free" }),
    ]);
    const deps = { decisions: llm, replies: null, tools };
    const first = await runTurn(flow, null, { type: "start" }, deps);
    const asked = await runTurn(flow, first.state, { type: "reply", text: "Book please" }, deps);
    const done = await runTurn(flow, asked.state, { type: "reply", text: "Ali" }, deps);
    expect(done.events.map((e) => e.type)).toEqual([
      "answer",
      "toolCall",
      "branch",
      "pathChosen",
      "say",
      "end",
    ]);
    expect(prompts[1]![1]!.content).toContain(
      'Note: The tool "checkAvailability" was called with {} and returned: {"free":true}',
    );
  });

  it("writes AI response steps with the language model and adds them to the transcript", async () => {
    const { llm, prompts } = scriptedLlm([
      "1",
      JSON.stringify({ reason: "not free", path: "None of these" }),
      "Sorry, that time is taken. How about Monday?",
    ]);
    const deps = { decisions: llm, replies: llm, tools };
    const first = await runTurn(flow, null, { type: "start" }, deps);
    const asked = await runTurn(flow, first.state, { type: "reply", text: "Book please" }, deps);
    const result = await runTurn(flow, asked.state, { type: "reply", text: "Ali" }, deps);

    const reply = result.events.find((e) => e.type === "aiResponse");
    expect(reply).toMatchObject({
      text: "Sorry, that time is taken. How about Monday?",
      llm: { model: "fake-1" },
    });
    expect(result.state.transcript.at(-2)).toEqual({
      role: "agent",
      text: "Sorry, that time is taken. How about Monday?",
    });
    const [system, conversation] = prompts[2]!;
    expect(system!.content).toContain("Your task for this step: Offer other times.");
    expect(system!.content).toContain("- caller_name: Ali");
    // The whole conversation, tool result included, is one transcript in one user message.
    expect(prompts[2]).toHaveLength(2);
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
    const decider = scriptedLlm([
      "1",
      JSON.stringify({ reason: "not free", path: "None of these" }),
    ]);
    const writer = scriptedLlm(["Sorry, that time is taken."]);
    const deps = { decisions: decider.llm, replies: writer.llm, tools };
    const first = await runTurn(flow, null, { type: "start" }, deps);
    const asked = await runTurn(flow, first.state, { type: "reply", text: "Book please" }, deps);
    await runTurn(flow, asked.state, { type: "reply", text: "Ali" }, deps);

    expect(decider.prompts).toHaveLength(2);
    expect(decider.prompts.every((p) => p[0]!.content.includes("You route a phone call"))).toBe(
      true,
    );
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

describe("runTurn prompt settings", () => {
  it("fills {{business_name}} and {{today}} in steps and uses the prompt in AI replies", async () => {
    const welcome: AgentFlow = {
      nodes: [
        node("start", "start", {}),
        node("hi", "say", { text: "Welcome to {{business_name}}! Today is {{today}}." }),
        node("ai", "aiResponse", { instructions: "Ask how you can help." }),
        node("bye", "end", { message: "" }),
      ],
      edges: [
        { id: "e1", source: "start", target: "hi" },
        { id: "e2", source: "hi", target: "ai" },
        { id: "e3", source: "ai", target: "bye" },
      ],
    };
    const writer = scriptedLlm(["How can I help you today?"]);
    const prompt = {
      ...DEFAULT_PROMPT_SETTINGS,
      businessName: "Shine Salon",
      rules: "Never promise refunds.",
    };
    const result = await runTurn(
      welcome,
      null,
      { type: "start" },
      {
        decisions: null,
        replies: writer.llm,
        prompt,
        now: new Date(2026, 7, 10),
      },
    );

    expect(result.events[0]).toMatchObject({
      text: "Welcome to Shine Salon! Today is Monday, August 10, 2026.",
    });
    const system = writer.prompts[0]![0]!.content;
    expect(system).toContain("You are the friendly phone receptionist for Shine Salon.");
    expect(system).toContain("Business rules:\nNever promise refunds.");
    expect(system).toContain("- business_name: Shine Salon");
  });
});

describe("runTurn structured answers and decisions", () => {
  const phoneFlow: AgentFlow = {
    nodes: [
      node("start", "start", {}),
      node("ask-phone", "ask", {
        question: "Your number?",
        variable: "phone",
        answerType: "phone",
      }),
      node("bye", "end", { message: "We'll text {{phone}}." }),
    ],
    edges: [
      { id: "e1", source: "start", target: "ask-phone" },
      { id: "e2", source: "ask-phone", target: "bye" },
    ],
  };

  it("saves a clean value, re-asks when the answer isn't understood, and gives up after 2 tries", async () => {
    const first = await runTurn(phoneFlow, null, { type: "start" }, noAi);
    const clean = await runTurn(
      phoneFlow,
      first.state,
      { type: "reply", text: "0300 123 4567" },
      noAi,
    );
    expect(clean.events[0]).toMatchObject({ type: "answer", value: "03001234567", by: "rules" });
    expect(clean.events.at(-1)).toMatchObject({ type: "end", message: "We'll text 03001234567." });

    const again1 = await runTurn(
      phoneFlow,
      first.state,
      { type: "reply", text: "the usual" },
      noAi,
    );
    expect(again1.events[0]).toMatchObject({
      type: "reask",
      question: "Sorry, I didn't quite catch that. Your number?",
    });
    expect(again1.state).toMatchObject({ nodeId: "ask-phone", waitingFor: "answer", retries: 1 });
    const again2 = await runTurn(phoneFlow, again1.state, { type: "reply", text: "dunno" }, noAi);
    expect(again2.state.retries).toBe(2);
    const gaveUp = await runTurn(
      phoneFlow,
      again2.state,
      { type: "reply", text: "whatever" },
      noAi,
    );
    expect(gaveUp.events[0]).toMatchObject({ type: "answer", value: "whatever", by: "gaveUp" });
    expect(gaveUp.state).toMatchObject({ nodeId: null, retries: 0 });
  });

  const keywordFlow: AgentFlow = {
    nodes: [
      node("start", "start", {}),
      node("hi", "say", { text: "How can I help?" }),
      node("intent", "branch", {
        conditions: [
          { id: "c-book", label: "Wants to book", keywords: "book, appointment" },
          { id: "c-cancel", label: "Wants to cancel", keywords: "cancel" },
        ],
      }),
      node("booking", "end", { message: "Booking" }),
      node("cancelling", "end", { message: "Cancelling" }),
      node("other", "end", { message: "Other" }),
    ],
    edges: [
      { id: "e1", source: "start", target: "hi" },
      { id: "e2", source: "hi", target: "intent" },
      { id: "e3", source: "intent", target: "booking", sourceHandle: "c-book" },
      { id: "e4", source: "intent", target: "cancelling", sourceHandle: "c-cancel" },
      { id: "e5", source: "intent", target: "other", sourceHandle: "else" },
    ],
  };

  it("routes with keywords when there is no AI", async () => {
    const first = await runTurn(keywordFlow, null, { type: "start" }, noAi);
    expect(first.state.waitingFor).toBe("callerMessage");
    const cases: [string, string][] = [
      ["I'd like an Appointment please", "Booking"],
      ["Please cancel it", "Cancelling"],
      ["I want to rebook", "Other"], // "book" only as a whole word
    ];
    for (const [said, ending] of cases) {
      const result = await runTurn(keywordFlow, first.state, { type: "reply", text: said }, noAi);
      expect(result.events.at(-1)).toMatchObject({ type: "end", message: ending });
    }
  });

  it("lets the AI decide with structured output, and shows what keywords would have chosen", async () => {
    const { llm, prompts } = scriptedLlm([
      JSON.stringify({ reason: "they want to call off the visit", path: "Wants to cancel" }),
    ]);
    const deps = { decisions: llm, replies: null };
    const first = await runTurn(keywordFlow, null, { type: "start" }, deps);
    const result = await runTurn(
      keywordFlow,
      first.state,
      { type: "reply", text: "I can't make it on Friday any more" },
      deps,
    );
    expect(result.events[0]).toMatchObject({
      type: "pathChosen",
      label: "Wants to cancel",
      by: "ai",
      reason: "they want to call off the visit",
      keywordGuess: "Otherwise",
    });
    expect(prompts[0]![0]!.content).toContain("copy the text of the path");
  });
});

describe("runTurn Branch rules", () => {
  const ruleFlow = (conditions: object[]): AgentFlow => ({
    nodes: [
      node("start", "start", {}),
      node("check", "tool", { toolName: "checkAvailability", saveAs: "slot" }),
      node("decide", "branch", { conditions }),
      node("yes", "end", { message: "free" }),
      node("other", "end", { message: "other" }),
    ],
    edges: [
      { id: "e1", source: "start", target: "check" },
      { id: "e2", source: "check", target: "decide" },
      { id: "e3", source: "decide", target: "yes", sourceHandle: "c1" },
      { id: "e4", source: "decide", target: "other", sourceHandle: "else" },
    ],
  });

  it("decides in code from a variable rule, without any AI", async () => {
    const flow = ruleFlow([{ id: "c1", label: "Free", variable: "slot_free", equals: "TRUE" }]);
    const result = await runTurn(flow, null, { type: "start" }, { ...noAi, tools });
    expect(result.events.find((e) => e.type === "pathChosen")).toEqual({
      type: "pathChosen",
      nodeId: "decide",
      label: "Free",
      by: "rule",
      reason: 'slot_free is "true"',
    });
    expect(result.events.at(-1)).toMatchObject({ type: "end", message: "free" });
  });

  it("takes Otherwise when every path has a rule and none matches", async () => {
    const flow = ruleFlow([{ id: "c1", label: "Failed", variable: "slot_ok", equals: "false" }]);
    const result = await runTurn(flow, null, { type: "start" }, { ...noAi, tools });
    expect(result.events.find((e) => e.type === "pathChosen")).toMatchObject({
      label: "Otherwise",
      by: "rule",
      reason: 'slot_ok is "true"',
    });
  });
});

describe("runTurn errors", () => {
  it("rejects actions that don't fit the current step", async () => {
    const base = { variables: {}, transcript: [], retries: 0 };
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

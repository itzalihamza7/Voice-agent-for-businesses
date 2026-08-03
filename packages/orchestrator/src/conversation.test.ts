import type { AgentFlow, ConversationState, FlowNode } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { ConversationError, runTurn } from "./conversation";

const at = { x: 0, y: 0 };
function node(id: string, type: FlowNode["type"], data: object): FlowNode {
  return { id, type, position: at, data } as FlowNode;
}

// Start → greet → intent (book? / otherwise) ; book: ask name → check tool → confirm → end
const flow: AgentFlow = {
  nodes: [
    node("start", "start", {}),
    node("greet", "say", { text: "Hello! How can I help?" }),
    node("intent", "branch", { conditions: [{ id: "c-book", label: "Wants to book" }] }),
    node("ask-name", "ask", { question: "Your name?", variable: "caller_name" }),
    node("check", "tool", { toolName: "checkAvailability" }),
    node("confirm", "say", { text: "Booked for {{caller_name}}." }),
    node("bye", "end", { message: "Bye {{caller_name}}!" }),
    node("human", "transfer", { phoneNumber: "+14155550100", message: "Transferring you." }),
  ],
  edges: [
    { id: "e1", source: "start", target: "greet" },
    { id: "e2", source: "greet", target: "intent" },
    { id: "e3", source: "intent", target: "ask-name", sourceHandle: "c-book" },
    { id: "e4", source: "intent", target: "human", sourceHandle: "else" },
    { id: "e5", source: "ask-name", target: "check" },
    { id: "e6", source: "check", target: "confirm" },
    { id: "e7", source: "confirm", target: "bye" },
  ],
};

describe("runTurn", () => {
  it("runs the booking path from start to end", () => {
    const first = runTurn(flow, null, { type: "start" });
    expect(first.events.map((e) => e.type)).toEqual(["say", "branch"]);
    expect(first.state).toEqual({ nodeId: "intent", variables: {} });

    const second = runTurn(flow, first.state, { type: "choosePath", handle: "c-book" });
    expect(second.events).toEqual([
      { type: "pathChosen", nodeId: "intent", label: "Wants to book" },
      { type: "ask", nodeId: "ask-name", question: "Your name?", variable: "caller_name" },
    ]);

    const third = runTurn(flow, second.state, { type: "answer", text: "Ali" });
    expect(third.events).toEqual([
      { type: "answer", nodeId: "ask-name", variable: "caller_name", value: "Ali" },
      { type: "tool", nodeId: "check", toolName: "checkAvailability" },
      { type: "say", nodeId: "confirm", text: "Booked for Ali." },
      { type: "end", nodeId: "bye", message: "Bye Ali!" },
    ]);
    expect(third.state).toEqual({ nodeId: null, variables: { caller_name: "Ali" } });
  });

  it("takes the Otherwise path to a transfer, which ends the call", () => {
    const first = runTurn(flow, null, { type: "start" });
    const result = runTurn(flow, first.state, { type: "choosePath", handle: "else" });
    expect(result.events.at(-1)).toEqual({
      type: "transfer",
      nodeId: "human",
      phoneNumber: "+14155550100",
      message: "Transferring you.",
    });
    expect(result.state.nodeId).toBeNull();
  });

  it("stops with an explanation when a step has nothing after it", () => {
    const deadEnd: AgentFlow = {
      nodes: [node("start", "start", {}), node("hi", "say", { text: "Hi" })],
      edges: [{ id: "e", source: "start", target: "hi" }],
    };
    const result = runTurn(deadEnd, null, { type: "start" });
    expect(result.events).toEqual([
      { type: "say", nodeId: "hi", text: "Hi" },
      {
        type: "stuck",
        nodeId: "hi",
        message: "Nothing is connected after this step, so the call can't continue.",
      },
    ]);
    expect(result.state.nodeId).toBeNull();
  });

  it("stops a loop that never waits for the caller", () => {
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
    const result = runTurn(loop, null, { type: "start" });
    expect(result.events.at(-1)?.type).toBe("stuck");
    expect(result.state.nodeId).toBeNull();
  });

  it("reports a flow without a Start step", () => {
    const result = runTurn({ nodes: [], edges: [] }, null, { type: "start" });
    expect(result.events).toEqual([{ type: "stuck", message: "The flow has no Start step." }]);
  });

  it("rejects actions that don't fit the current step", () => {
    const atBranch: ConversationState = { nodeId: "intent", variables: {} };
    const atAsk: ConversationState = { nodeId: "ask-name", variables: {} };
    const over: ConversationState = { nodeId: null, variables: {} };

    expect(() => runTurn(flow, atBranch, { type: "answer", text: "hi" })).toThrow(
      ConversationError,
    );
    expect(() => runTurn(flow, atAsk, { type: "choosePath", handle: "else" })).toThrow(
      ConversationError,
    );
    expect(() => runTurn(flow, atBranch, { type: "choosePath", handle: "nope" })).toThrow(
      ConversationError,
    );
    expect(() => runTurn(flow, over, { type: "answer", text: "hi" })).toThrow("already over");
  });
});

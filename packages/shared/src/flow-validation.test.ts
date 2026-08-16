import { describe, expect, it } from "vitest";
import { BRANCH_ELSE_HANDLE, type AgentFlow, type FlowEdge, type FlowNode } from "./flow";
import { validateFlow } from "./flow-validation";

const at = { x: 0, y: 0 };
const start: FlowNode = { id: "start", type: "start", position: at, data: {} };
const say: FlowNode = { id: "say", type: "say", position: at, data: { text: "Hi!" } };
const end: FlowNode = { id: "end", type: "end", position: at, data: { message: "" } };

function edge(source: string, target: string, sourceHandle?: string): FlowEdge {
  return { id: `${source}-${sourceHandle ?? ""}-${target}`, source, target, sourceHandle };
}

function messages(flow: AgentFlow) {
  return validateFlow(flow).map(
    (issue) => `${issue.nodeId ?? issue.edgeId ?? "flow"}: ${issue.message}`,
  );
}

describe("validateFlow", () => {
  it("accepts a complete flow", () => {
    const flow = { nodes: [start, say, end], edges: [edge("start", "say"), edge("say", "end")] };
    expect(validateFlow(flow)).toEqual([]);
  });

  it("requires exactly one Start node", () => {
    expect(messages({ nodes: [], edges: [] })).toEqual([
      "flow: Add a Start node: every call begins there.",
    ]);
    const second = { ...start, id: "start2" };
    expect(messages({ nodes: [start, second], edges: [] })).toContain(
      "start2: Only one Start node is allowed.",
    );
  });

  it("reports empty required settings", () => {
    const emptySay: FlowNode = { ...say, data: { text: "  " } };
    const flow = {
      nodes: [start, emptySay, end],
      edges: [edge("start", "say"), edge("say", "end")],
    };
    expect(messages(flow)).toEqual(["say: Say: enter what the agent should say."]);
  });

  it("checks Ask variable names and duplicates", () => {
    const ask1: FlowNode = {
      id: "a1",
      type: "ask",
      position: at,
      data: { question: "Q?", variable: "order_no", answerType: "text" },
    };
    const ask2: FlowNode = {
      id: "a2",
      type: "ask",
      position: at,
      data: { question: "Q?", variable: "order_no", answerType: "text" },
    };
    const ask3: FlowNode = {
      id: "a3",
      type: "ask",
      position: at,
      data: { question: "Q?", variable: "2bad", answerType: "text" },
    };
    const flow = {
      nodes: [start, ask1, ask2, ask3, end],
      edges: [edge("start", "a1"), edge("a1", "a2"), edge("a2", "a3"), edge("a3", "end")],
    };
    expect(messages(flow)).toEqual([
      'a2: Ask: the variable "order_no" is already used by another Ask step.',
      "a3: Ask: the variable name must use letters, digits or _ (e.g. order_number).",
    ]);
  });

  it("checks Transfer phone numbers", () => {
    const transfer: FlowNode = {
      id: "t",
      type: "transfer",
      position: at,
      data: { phoneNumber: "0300 1234567", message: "" },
    };
    expect(messages({ nodes: [start, transfer], edges: [edge("start", "t")] })).toEqual([
      "t: Transfer: enter the phone number in international format, e.g. +14155550123.",
    ]);
  });

  it("reports dead ends, extra connections and steps after the call ended", () => {
    const flow = {
      nodes: [start, say, end],
      edges: [edge("start", "say"), edge("start", "end"), edge("end", "say")],
    };
    expect(messages(flow)).toEqual([
      "start: Only one connection can leave this step. Use a Branch to split the call.",
      "say: Nothing happens after this step: connect it to the next one.",
      "end: This step ends the call, so nothing can follow it.",
    ]);
  });

  it("reports steps not reachable from Start and connections into Start", () => {
    const flow = { nodes: [start, say, end], edges: [edge("say", "start"), edge("start", "end")] };
    expect(messages(flow)).toEqual([
      "start: Nothing can connect into Start.",
      "say: Not reachable from Start: connect a step to it.",
    ]);
  });

  it("requires every Branch path, including Otherwise, to be connected once", () => {
    const branch: FlowNode = {
      id: "b",
      type: "branch",
      position: at,
      data: { conditions: [{ id: "c1", label: "Wants to book", keywords: "" }] },
    };
    const connected = {
      nodes: [start, branch, end],
      edges: [edge("start", "b"), edge("b", "end", "c1"), edge("b", "end", BRANCH_ELSE_HANDLE)],
    };
    expect(validateFlow(connected)).toEqual([]);

    const missingElse = { ...connected, edges: connected.edges.slice(0, 2) };
    expect(messages(missingElse)).toEqual(['b: Branch: connect the "Otherwise" path.']);
  });

  it("reports connections to steps that don't exist", () => {
    const flow = { nodes: [start, end], edges: [edge("start", "end"), edge("end", "ghost")] };
    expect(messages(flow)).toEqual(["end--ghost: Connection points to a step that doesn't exist."]);
  });

  it("reports {{variables}} that no Ask step saves, but accepts built-in ones", () => {
    const ask: FlowNode = {
      id: "a",
      type: "ask",
      position: at,
      data: { question: "Name?", variable: "caller_name", answerType: "text" },
    };
    const greet: FlowNode = {
      id: "g",
      type: "say",
      position: at,
      data: { text: "Thanks {{caller_name}}, welcome to {{business_name}}! {{caller_nam}}" },
    };
    const flow = {
      nodes: [start, ask, greet, end],
      edges: [edge("start", "a"), edge("a", "g"), edge("g", "end")],
    };
    expect(messages(flow)).toEqual([
      "g: {{caller_nam}} isn't a known variable: check the spelling, or add an Ask step that saves it.",
    ]);
  });
});

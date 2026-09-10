import { MemorySaver } from "@langchain/langgraph";
import { FlowNodeSchema, type AgentFlow, type FlowNode } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { CallSessions } from "./call-graph";

const node = (id: string, type: FlowNode["type"], data: object): FlowNode =>
  FlowNodeSchema.parse({ id, type, position: { x: 0, y: 0 }, data });

// Start → ask name → say hello → end.
const flow: AgentFlow = {
  nodes: [
    node("start", "start", {}),
    node("ask", "ask", { question: "Your name?", variable: "caller_name" }),
    node("hello", "say", { text: "Hello {{caller_name}}!" }),
    node("bye", "end", { message: "Bye!" }),
  ],
  edges: [
    { id: "e1", source: "start", target: "ask" },
    { id: "e2", source: "ask", target: "hello" },
    { id: "e3", source: "hello", target: "bye" },
  ],
};
const noAi = { decisions: null, replies: null };

describe("CallSessions (LangGraph)", () => {
  it("keeps a call between requests and resumes it when the caller answers", async () => {
    const saver = new MemorySaver();
    const first = await new CallSessions(saver).start("call-1", flow, noAi);
    expect(first.state.waitingFor).toBe("answer");
    expect(first.events.map((e) => e.type)).toEqual(["ask"]);

    // A new CallSessions, as in a separate request: the state comes from the checkpointer.
    const second = await new CallSessions(saver).send(
      "call-1",
      { type: "reply", text: "Ali" },
      noAi,
    );
    expect(second.state.nodeId).toBeNull();
    expect(second.events.map((e) => e.type)).toEqual(["answer", "say", "end"]);
    expect(second.state.transcript.map((e) => e.text)).toEqual([
      "Your name?",
      "Ali",
      "Hello Ali!",
      "Bye!",
    ]);
    await expect(
      new CallSessions(saver).send("call-1", { type: "reply", text: "Hi?" }, noAi),
    ).rejects.toThrow("already over");
  });

  it("explains an action that doesn't fit and keeps waiting", async () => {
    const saver = new MemorySaver();
    const sessions = new CallSessions(saver);
    await sessions.start("call-2", flow, noAi);
    const wrong = await sessions.send("call-2", { type: "choosePath", handle: "x" }, noAi);
    expect(wrong.events).toEqual([
      { type: "stuck", nodeId: "ask", message: "The agent isn't at a Branch." },
    ]);
    expect(wrong.state.waitingFor).toBe("answer");
    const ok = await sessions.send("call-2", { type: "reply", text: "Sam" }, noAi);
    expect(ok.state.variables.caller_name).toBe("Sam");
  });

  it("refuses unknown calls", async () => {
    await expect(
      new CallSessions(new MemorySaver()).send("nope", { type: "reply", text: "Hi" }, noAi),
    ).rejects.toThrow("no call");
    expect(await new CallSessions(new MemorySaver()).get("nope")).toBeNull();
  });
});

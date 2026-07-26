import { AgentFlowSchema, type AgentFlow } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { fromReactFlow, toReactFlow } from "./flow-mapping";

const flow: AgentFlow = {
  nodes: [
    { id: "start", type: "start", position: { x: 0, y: 0 }, data: {} },
    {
      id: "b",
      type: "branch",
      position: { x: 0, y: 100 },
      data: { conditions: [{ id: "c1", label: "Wants to book" }] },
    },
    { id: "end", type: "end", position: { x: 0, y: 200 }, data: { message: "Bye" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "b" },
    { id: "e2", source: "b", target: "end", sourceHandle: "c1" },
  ],
};

describe("flow mapping", () => {
  it("round-trips a flow unchanged", () => {
    const { nodes, edges } = toReactFlow(flow);
    expect(fromReactFlow(nodes, edges)).toEqual(flow);
  });

  it("drops React Flow UI state and rounds positions", () => {
    const { nodes, edges } = toReactFlow(flow);
    const touched = nodes.map((node) => ({
      ...node,
      selected: true,
      measured: { width: 200, height: 80 },
      position: { x: node.position.x + 0.4, y: node.position.y + 0.6 },
    }));
    const nullHandle = edges.map((edge) => ({ ...edge, sourceHandle: edge.sourceHandle ?? null }));

    const result = fromReactFlow(touched, nullHandle);
    expect(AgentFlowSchema.parse(result)).toEqual(result);
    expect(result.nodes[1]).toEqual({ ...flow.nodes[1], position: { x: 0, y: 101 } });
    expect(result.edges[0]).toEqual({ id: "e1", source: "start", target: "b" });
  });

  it("makes only the Start node undeletable", () => {
    expect(toReactFlow(flow).nodes.map((n) => n.deletable)).toEqual([false, true, true]);
  });
});

import type { AgentFlow, FlowNode } from "@voice-agent/shared";
import type { Edge, Node } from "@xyflow/react";

// Converts between our stored AgentFlow and React Flow's node/edge objects.
// React Flow adds UI state (selected, measured size, ...) that must not be saved.

export type BuilderNode = Node<FlowNode["data"], FlowNode["type"]>;

export function toBuilderNode(node: FlowNode): BuilderNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
    // The single Start node can't be deleted.
    deletable: node.type !== "start",
  };
}

export function toReactFlow(flow: AgentFlow): { nodes: BuilderNode[]; edges: Edge[] } {
  return {
    nodes: flow.nodes.map(toBuilderNode),
    edges: flow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    })),
  };
}

export function fromReactFlow(nodes: BuilderNode[], edges: Edge[]): AgentFlow {
  return {
    nodes: nodes.map(toFlowNode),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    })),
  };
}

export function toFlowNode(node: BuilderNode): FlowNode {
  // Builder nodes are only ever created from FlowNodes (see createNode), so their
  // type and data always belong together. TypeScript can't track that through React Flow.
  return {
    id: node.id,
    type: node.type,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    data: node.data,
  } as FlowNode;
}

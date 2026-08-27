import type { FlowNode, FlowNodeData, FlowNodeType } from "@voice-agent/shared";

// Everything the builder UI needs to know about each node type, in one place.

interface NodeKind<T extends FlowNodeType> {
  label: string;
  description: string;
  // Tailwind classes for the node's accent colour.
  accent: string;
  defaultData: () => FlowNodeData<T>;
  // One-line preview shown on the node card.
  summary: (data: FlowNodeData<T>) => string;
}

type Catalog = { [T in FlowNodeType]: NodeKind<T> };

export const NODE_CATALOG: Catalog = {
  start: {
    label: "Start",
    description: "Where every call begins.",
    accent: "border-emerald-500 bg-emerald-50",
    defaultData: () => ({}),
    summary: () => "Call starts here",
  },
  say: {
    label: "Say",
    description: "The agent says a fixed sentence.",
    accent: "border-sky-500 bg-sky-50",
    defaultData: () => ({ text: "" }),
    summary: (data) => data.text,
  },
  ask: {
    label: "Ask",
    description: "Ask a question and remember the answer.",
    accent: "border-indigo-500 bg-indigo-50",
    defaultData: () => ({ question: "", variable: "", answerType: "text" }),
    summary: (data) => (data.variable ? `${data.question} → {{${data.variable}}}` : data.question),
  },
  aiResponse: {
    label: "AI response",
    description: "The AI writes the reply, following your instructions.",
    accent: "border-violet-500 bg-violet-50",
    defaultData: () => ({ instructions: "", tools: [] }),
    summary: (data) => data.instructions,
  },
  branch: {
    label: "Branch",
    description: "Choose a path based on what the caller said.",
    accent: "border-amber-500 bg-amber-50",
    defaultData: () => ({
      conditions: [{ id: newId("c"), label: "", keywords: "", variable: "", equals: "" }],
    }),
    summary: (data) => `${data.conditions.length} path(s) + otherwise`,
  },
  tool: {
    label: "Tool",
    description: "Call a tool, e.g. look up an order.",
    accent: "border-orange-500 bg-orange-50",
    defaultData: () => ({ toolName: "", arguments: {}, saveAs: "" }),
    summary: (data) => data.toolName,
  },
  knowledgeLookup: {
    label: "Knowledge lookup",
    description: "Search the business's documents and FAQs.",
    accent: "border-teal-500 bg-teal-50",
    defaultData: () => ({ query: "", limit: 3, mode: "hybrid", rewrite: true, rerank: true }),
    summary: (data) => data.query,
  },
  transfer: {
    label: "Transfer",
    description: "Hand the call to a human.",
    accent: "border-rose-500 bg-rose-50",
    defaultData: () => ({ phoneNumber: "", message: "" }),
    summary: (data) => data.phoneNumber,
  },
  end: {
    label: "End",
    description: "Hang up, optionally with a goodbye.",
    accent: "border-gray-500 bg-gray-50",
    defaultData: () => ({ message: "" }),
    summary: (data) => data.message || "Call ends",
  },
};

/** Node types that can be added from the palette (a flow has exactly one Start). */
export const PALETTE_TYPES: FlowNodeType[] = [
  "say",
  "ask",
  "aiResponse",
  "branch",
  "tool",
  "knowledgeLookup",
  "transfer",
  "end",
];

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createNode(type: FlowNodeType, position: { x: number; y: number }): FlowNode {
  // The catalog guarantees defaultData matches the type, which TypeScript can't see here.
  return { id: newId(type), type, position, data: NODE_CATALOG[type].defaultData() } as FlowNode;
}

export function nodeSummary(node: FlowNode): string {
  // Same reason as createNode: each catalog entry's summary takes its own type's data.
  const summary = NODE_CATALOG[node.type].summary as (data: FlowNode["data"]) => string;
  return summary(node.data);
}

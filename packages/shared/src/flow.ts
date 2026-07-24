import { z } from "zod";

// The conversation flow an agent follows: nodes (steps) connected by edges.
//
// These schemas check the *shape* of a flow: known node types, right field types.
// They deliberately allow unfinished drafts (e.g. a Say node with empty text), so work in
// progress can always be saved. Whether a flow is complete enough to run is checked
// separately by validateFlow() in flow-validation.ts.

const PositionSchema = z.object({ x: z.number(), y: z.number() });

function nodeSchema<T extends string, D extends z.ZodType>(type: T, data: D) {
  return z.object({ id: z.string().min(1), type: z.literal(type), position: PositionSchema, data });
}

export const BranchConditionSchema = z.object({
  id: z.string().min(1),
  // Plain-English description of when to take this path, e.g. "Caller wants to book".
  label: z.string(),
});

export const FlowNodeSchema = z.discriminatedUnion("type", [
  // Where every call begins. Exactly one per flow.
  nodeSchema("start", z.object({})),
  // The agent says a fixed sentence.
  nodeSchema("say", z.object({ text: z.string() })),
  // The agent asks a question and stores the answer in a variable, e.g. order_number.
  nodeSchema("ask", z.object({ question: z.string(), variable: z.string() })),
  // The LLM writes the reply, guided by these instructions (prompt studio: roadmap phase 3).
  nodeSchema("aiResponse", z.object({ instructions: z.string() })),
  // Picks one outgoing path. Each condition has its own output, plus an "else" output.
  nodeSchema("branch", z.object({ conditions: z.array(BranchConditionSchema) })),
  // Calls a tool, e.g. lookupOrder (tools: roadmap phase 5).
  nodeSchema("tool", z.object({ toolName: z.string() })),
  // Searches the business's knowledge base (RAG: roadmap phase 6).
  nodeSchema("knowledgeLookup", z.object({ query: z.string() })),
  // Hands the call to a human. Ends the agent's part of the call.
  nodeSchema("transfer", z.object({ phoneNumber: z.string(), message: z.string() })),
  // Hangs up, optionally after a goodbye message.
  nodeSchema("end", z.object({ message: z.string() })),
]);

// The output of a Branch node that is taken when no condition matches.
export const BRANCH_ELSE_HANDLE = "else";

export const FlowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  // Which output of the source node the edge leaves from. Only Branch nodes have several
  // outputs (one per condition id, plus BRANCH_ELSE_HANDLE); for other nodes it is omitted.
  sourceHandle: z.string().min(1).optional(),
});

export const AgentFlowSchema = z.object({
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
});

export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowNodeType = FlowNode["type"];
export type FlowNodeData<T extends FlowNodeType> = Extract<FlowNode, { type: T }>["data"];
export type BranchCondition = z.infer<typeof BranchConditionSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type AgentFlow = z.infer<typeof AgentFlowSchema>;

export const FLOW_NODE_TYPES = FlowNodeSchema.options.map((option) => option.shape.type.value);

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
  // Optional comma-separated words, e.g. "book, appointment". Used to choose the path without
  // AI, and shown next to the AI's choice for comparison. Older flows default to none.
  keywords: z.string().default(""),
  // Optional rule, checked in code before any AI: take this path when {{variable}} equals the
  // value (case-insensitive), e.g. availability_requestedTimeFree = true. Best for tool results:
  // true/false decisions shouldn't depend on a language model reading JSON correctly.
  variable: z.string().default(""),
  equals: z.string().default(""),
});

// What kind of answer an Ask step expects. Anything but "text" is turned into a clean value
// (e.g. "next Friday" → 2026-10-23) and the caller is asked again when it can't be understood.
export const ANSWER_TYPES = [
  "text",
  "name",
  "phone",
  "email",
  "date",
  "time",
  "number",
  "yesNo",
] as const;
export const AnswerTypeSchema = z.enum(ANSWER_TYPES);
export type AnswerType = z.infer<typeof AnswerTypeSchema>;

export const FlowNodeSchema = z.discriminatedUnion("type", [
  // Where every call begins. Exactly one per flow.
  nodeSchema("start", z.object({})),
  // The agent says a fixed sentence.
  nodeSchema("say", z.object({ text: z.string() })),
  // The agent asks a question and stores the answer in a variable, e.g. order_number.
  nodeSchema(
    "ask",
    z.object({
      question: z.string(),
      variable: z.string(),
      // Older flows default to free text.
      answerType: AnswerTypeSchema.default("text"),
    }),
  ),
  // The LLM writes the reply, guided by these instructions (prompt studio: roadmap phase 3).
  nodeSchema(
    "aiResponse",
    z.object({
      instructions: z.string(),
      // Tools the AI may call (in a loop) before it answers, e.g. checkAvailability.
      tools: z.array(z.string()).default([]),
    }),
  ),
  // Picks one outgoing path. Each condition has its own output, plus an "else" output.
  nodeSchema("branch", z.object({ conditions: z.array(BranchConditionSchema) })),
  // Calls a tool, e.g. checkAvailability. Arguments are templates such as "{{preferred_date}}";
  // arguments left empty are filled in by the AI from the conversation (function calling).
  // With saveAs set, the result's fields become variables, e.g. {{booking_reference}}.
  nodeSchema(
    "tool",
    z.object({
      toolName: z.string(),
      arguments: z.record(z.string(), z.string()).default({}),
      saveAs: z.string().default(""),
    }),
  ),
  // Searches the business's knowledge base (RAG) for what the caller asked. `query` is the topic,
  // added to the caller's words. The results are given to later AI steps as numbered sources.
  nodeSchema(
    "knowledgeLookup",
    z.object({
      query: z.string(),
      // How many passages to give the AI.
      limit: z.number().int().min(1).max(8).default(3),
      // hybrid = keyword + meaning (vector) search, merged.
      mode: z.enum(["hybrid", "vector", "keyword"]).default("hybrid"),
      // Let the AI turn the caller's words into a search query first.
      rewrite: z.boolean().default(true),
      // Let the AI rate the results and drop unrelated ones. On by default: without it, small
      // models given unrelated passages invented answers ("we do offer tattoos").
      rerank: z.boolean().default(true),
    }),
  ),
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

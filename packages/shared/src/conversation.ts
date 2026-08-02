import { z } from "zod";
import { AgentFlowSchema } from "./flow";

// Types for running a conversation through a flow (the test chat today, real calls later).
// The engine itself lives in @voice-agent/orchestrator.

export const ConversationStateSchema = z.object({
  // The Ask or Branch step the conversation is waiting at. null = the call is over.
  nodeId: z.string().min(1).nullable(),
  // Answers collected by Ask steps, by variable name.
  variables: z.record(z.string(), z.string()),
});

export const ConversationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  // The caller's answer to the Ask step being waited at.
  z.object({ type: z.literal("answer"), text: z.string().trim().min(1).max(2000) }),
  // Which path to take at the Branch step being waited at (a condition id or "else").
  z.object({ type: z.literal("choosePath"), handle: z.string().min(1) }),
]);

export const SimulateRequestSchema = z.object({
  flow: AgentFlowSchema,
  // null only together with a "start" action.
  state: ConversationStateSchema.nullable(),
  action: ConversationActionSchema,
});

/** What happened during one turn, in order. The test chat turns these into messages. */
export type ConversationEvent =
  | { type: "say"; nodeId: string; text: string }
  | { type: "ask"; nodeId: string; question: string; variable: string }
  | { type: "answer"; nodeId: string; variable: string; value: string }
  | { type: "aiResponse"; nodeId: string; instructions: string }
  | { type: "tool"; nodeId: string; toolName: string }
  | { type: "knowledgeLookup"; nodeId: string; query: string }
  | { type: "branch"; nodeId: string; paths: { handle: string; label: string }[] }
  | { type: "pathChosen"; nodeId: string; label: string }
  | { type: "transfer"; nodeId: string; phoneNumber: string; message: string }
  | { type: "end"; nodeId: string; message: string }
  // The flow can't continue, e.g. a step with nothing connected after it.
  | { type: "stuck"; nodeId?: string; message: string };

export interface TurnResult {
  state: ConversationState;
  events: ConversationEvent[];
}

export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type ConversationAction = z.infer<typeof ConversationActionSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;

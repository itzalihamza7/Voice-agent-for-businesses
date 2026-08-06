import { z } from "zod";
import { AgentFlowSchema } from "./flow";

// Types for running a conversation through a flow (the test chat today, real calls later).
// The engine itself lives in @voice-agent/orchestrator.

export const TranscriptEntrySchema = z.object({
  // "system" = a note for the AI, e.g. that a tool was called. Not spoken to the caller.
  role: z.enum(["agent", "caller", "system"]),
  text: z.string(),
});

export const ConversationStateSchema = z.object({
  // The Ask or Branch step the conversation is waiting at. null = the call is over.
  nodeId: z.string().min(1).nullable(),
  // What the conversation is waiting for at that step:
  //   "answer"        - the caller's answer to an Ask step
  //   "callerMessage" - what the caller says, so the AI can choose a Branch path
  //   "path"          - a Branch path picked by hand (no AI, or the AI lacks the information)
  waitingFor: z.enum(["answer", "callerMessage", "path"]).nullable(),
  // Answers collected by Ask steps, by variable name.
  variables: z.record(z.string(), z.string()),
  // Everything said so far. The AI reads it to choose paths and write replies.
  transcript: z.array(TranscriptEntrySchema).max(1000),
});

export const ConversationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  // What the caller says: an answer to an Ask step, or a message the AI routes at a Branch.
  z.object({ type: z.literal("reply"), text: z.string().trim().min(1).max(2000) }),
  // Pick a Branch path by hand (a condition id or "else"), optionally with what the caller said.
  z.object({
    type: z.literal("choosePath"),
    handle: z.string().min(1),
    callerText: z.string().trim().max(2000).optional(),
  }),
]);

export const SimulateRequestSchema = z.object({
  flow: AgentFlowSchema,
  // null only together with a "start" action.
  state: ConversationStateSchema.nullable(),
  action: ConversationActionSchema,
  // Language model provider name ("ollama", "openai", ...), or null to run without AI.
  llm: z.string().min(1).nullable(),
});

/** One request to a language model: which model, how long it took, how many tokens. */
export interface LlmCallInfo {
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** What happened during one turn, in order. The test chat turns these into messages. */
export type ConversationEvent =
  | { type: "say"; nodeId: string; text: string }
  | { type: "ask"; nodeId: string; question: string; variable: string }
  | { type: "answer"; nodeId: string; variable: string; value: string }
  // text is null when running without AI.
  | {
      type: "aiResponse";
      nodeId: string;
      instructions: string;
      text: string | null;
      llm?: LlmCallInfo;
    }
  | { type: "tool"; nodeId: string; toolName: string }
  | { type: "knowledgeLookup"; nodeId: string; query: string }
  | { type: "branch"; nodeId: string; paths: { handle: string; label: string }[] }
  | {
      type: "pathChosen";
      nodeId: string;
      label: string;
      by: "you" | "ai";
      llm?: LlmCallInfo;
      // The AI's raw answer, to see how it decided.
      aiAnswer?: string;
    }
  // Explanations for the person testing, e.g. why a path has to be picked by hand.
  | { type: "note"; nodeId: string; message: string }
  // The language model failed. The call goes on without it where it can.
  | { type: "llmError"; nodeId: string; message: string }
  | { type: "transfer"; nodeId: string; phoneNumber: string; message: string }
  | { type: "end"; nodeId: string; message: string }
  // The flow can't continue, e.g. a step with nothing connected after it.
  | { type: "stuck"; nodeId?: string; message: string };

export interface TurnResult {
  state: ConversationState;
  events: ConversationEvent[];
}

export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;
export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type ConversationAction = z.infer<typeof ConversationActionSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;

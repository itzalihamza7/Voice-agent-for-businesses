import { z } from "zod";
import { AgentFlowSchema } from "./flow";
import { PromptSettingsSchema } from "./prompt";
import { AgentToolsSchema } from "./tools";

// Types for running a conversation through a flow (the test chat today, real calls later).
// The engine itself lives in @voice-agent/orchestrator.

export const TranscriptEntrySchema = z.object({
  // "system" = a note for the AI, e.g. that a tool was called. Not spoken to the caller.
  role: z.enum(["agent", "caller", "system"]),
  text: z.string(),
});

// The rolling summary of the call's earlier part: what the AI sees instead of those messages.
export const CallSummarySchema = z.object({
  text: z.string(),
  // The summary covers transcript[0 .. upTo - 1].
  upTo: z.number().int().min(0),
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
  // How many times the current Ask step has re-asked because the answer wasn't understood.
  retries: z.number().int().min(0).default(0),
  // Added in phase 7 (memory & context), so older states from the browser still parse.
  summary: CallSummarySchema.nullable().default(null),
  // The caller's number (caller ID) and what is remembered about them from earlier calls.
  callerPhone: z.string().nullable().default(null),
  callerMemory: z.array(z.string()).default([]),
  // The agent the call was handed off to (multi-agent), whose flow runs from then on.
  agentId: z.string().nullable().default(null),
});

const PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, "Not a phone number");

// What the caller says: an answer to an Ask step, or a message the AI routes at a Branch.
const ReplyActionSchema = z.object({
  type: z.literal("reply"),
  text: z.string().trim().min(1).max(2000),
});
// Pick a Branch path by hand (a condition id or "else"), optionally with what the caller said.
const ChoosePathActionSchema = z.object({
  type: z.literal("choosePath"),
  handle: z.string().min(1),
  callerText: z.string().trim().max(2000).optional(),
});

export const ConversationActionSchema = z.discriminatedUnion("type", [
  // callerPhone: the number the call comes from, for the caller's long-term memory.
  z.object({ type: z.literal("start"), callerPhone: PhoneNumberSchema.optional() }),
  ReplyActionSchema,
  ChoosePathActionSchema,
]);

/** What can happen once a call is going: the caller speaks, or a path is picked by hand. */
export const CallerActionSchema = z.discriminatedUnion("type", [
  ReplyActionSchema,
  ChoosePathActionSchema,
]);

/** A language model: provider name plus, optionally, a specific model, e.g. ollama + "qwen3:8b". */
export const ModelSpecSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
});

export const SimulateRequestSchema = z.object({
  flow: AgentFlowSchema,
  // null only together with a "start" action.
  state: ConversationStateSchema.nullable(),
  action: ConversationActionSchema,
  // Which language models to use. null = no AI for that job.
  // Routing: Branch decisions are short and easy, so a small fast model can make them,
  // while a stronger model writes the replies.
  models: z.object({
    decisions: ModelSpecSchema.nullable(),
    replies: ModelSpecSchema.nullable(),
    // Answers instead when a model fails, e.g. OpenAI when Ollama isn't running.
    fallback: ModelSpecSchema.nullable(),
  }),
  // The agent's prompt settings, possibly unsaved edits. Defaults when missing.
  prompt: PromptSettingsSchema.optional(),
  // The agent's webhook tools and MCP servers, possibly unsaved edits.
  tools: AgentToolsSchema.optional(),
  // Tokens the conversation part of each prompt may use (see orchestrator/context.ts).
  contextBudget: z.number().int().min(200).max(50_000).optional(),
});

/** The models and per-request settings every test-call request sends (they can change mid-call). */
const CallSettingsSchema = SimulateRequestSchema.pick({
  models: true,
  prompt: true,
  tools: true,
  contextBudget: true,
});

/** Starts a test call kept on the server (LangGraph thread). */
export const StartTestCallSchema = CallSettingsSchema.extend({
  flow: AgentFlowSchema,
  callerPhone: PhoneNumberSchema.optional(),
  // The agent version being tested, for the call log (unsaved edits still log as that version).
  agentId: z.string().min(1).optional(),
  agentVersion: z.number().int().positive().optional(),
});

/** The caller speaks (or a path is picked by hand) in a test call. */
export const TestCallActionSchema = CallSettingsSchema.extend({
  action: CallerActionSchema,
});

/** Prompt playground: one AI reply with the given prompt settings, to compare two versions. */
export const PromptPlaygroundRequestSchema = z.object({
  prompt: PromptSettingsSchema,
  model: ModelSpecSchema,
  // The AI response step's instructions.
  instructions: z.string().trim().min(1).max(4000),
  // What the caller just said.
  callerMessage: z.string().trim().min(1).max(2000),
  // Answers collected earlier in the call, e.g. { caller_name: "Ali" }.
  variables: z.record(z.string(), z.string()).default({}),
});

/** One entry in the model picker. */
export interface ModelOption {
  provider: string;
  model: string;
  label: string;
}

/** One request to a language model: which model, how long it took, how many tokens. */
export interface LlmCallInfo {
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Input tokens served from the provider's prompt cache. */
  cachedInputTokens: number | null;
  /** Estimated US dollars. 0 for local models, null when unknown. */
  costUsd: number | null;
  /** Set when the chosen model failed and the fallback model answered. */
  fellBackFrom?: { model: string; error: string };
  /** The model's context window cut the prompt (it counted far fewer tokens than were sent). */
  promptCut?: boolean;
}

/** What happened during one turn, in order. The test chat turns these into messages. */
export type ConversationEvent =
  | { type: "say"; nodeId: string; text: string }
  | { type: "ask"; nodeId: string; question: string; variable: string }
  | {
      type: "answer";
      nodeId: string;
      variable: string;
      /** The clean value that was saved, e.g. "2026-10-23". */
      value: string;
      /** What the caller actually said. */
      raw: string;
      /** "text" = saved as said, "rules" = plain code, "ai" = language model, "gaveUp" = not understood. */
      by: "text" | "rules" | "ai" | "gaveUp";
      llm?: LlmCallInfo;
    }
  // The answer to an Ask step wasn't understood, so the agent asks again.
  | { type: "reask"; nodeId: string; question: string; reason: string; llm?: LlmCallInfo }
  // text is null when running without AI.
  | {
      type: "aiResponse";
      nodeId: string;
      instructions: string;
      text: string | null;
      llm?: LlmCallInfo;
    }
  // A tool was called: by a Tool step, or by the AI during an AI response step.
  | {
      type: "toolCall";
      nodeId: string;
      toolName: string;
      by: "step" | "ai";
      arguments: Record<string, unknown>;
      /** Arguments the AI filled in because the step left them empty. */
      filledByAi?: string[];
      ok: boolean;
      result?: Record<string, unknown>;
      error?: string;
      latencyMs: number;
      llm?: LlmCallInfo;
    }
  | {
      type: "knowledgeLookup";
      nodeId: string;
      /** What was asked: the caller's words plus the step's topic. */
      query: string;
      /** What was actually searched (after AI rewriting). */
      searchQuery: string;
      results: { documentTitle: string; heading: string | null; excerpt: string; score: number }[];
      latencyMs: number;
      /** Set when the search couldn't run. */
      error?: string;
      /** Rewriting and reranking calls, summed. */
      llm?: LlmCallInfo;
    }
  | { type: "branch"; nodeId: string; paths: { handle: string; label: string }[] }
  | {
      type: "pathChosen";
      nodeId: string;
      label: string;
      /** "you" = by hand, "ai" = language model, "keywords" = keyword rules, "rule" = variable rule. */
      by: "you" | "ai" | "keywords" | "rule";
      llm?: LlmCallInfo;
      // The AI's raw answer and its short explanation, to see how it decided.
      aiAnswer?: string;
      reason?: string;
      /** What the keyword rules would have chosen, for comparison with the AI. */
      keywordGuess?: string;
    }
  // The conversation didn't fit the context budget, so parts were shortened or left out.
  | {
      type: "contextCut";
      nodeId: string;
      tokensBefore: number;
      tokensAfter: number;
      notesShortened: number;
      messagesDropped: number;
    }
  // The rolling summary was updated with `added` more messages.
  | { type: "summary"; text: string; added: number; llm?: LlmCallInfo }
  // The caller's long-term memory: loaded at the start, updated at the end of the call.
  | { type: "memoryLoaded"; phoneNumber: string; facts: string[]; callCount: number }
  | { type: "memorySaved"; phoneNumber: string; facts: string[]; llm?: LlmCallInfo }
  | { type: "memoryError"; phoneNumber: string; message: string }
  // A guardrail stepped in: card number removed, injection attempt, escalation to a person,
  // or an AI reply that stated unknown facts (ungrounded) or broke a rule (policy).
  | {
      type: "guardrail";
      nodeId: string;
      kind: "redacted" | "injection" | "escalation" | "ungrounded" | "policy";
      detail: string;
      /** The reply that was stopped, for the person testing. */
      original?: string;
    }
  // Explanations for the person testing, e.g. why a path has to be picked by hand.
  | { type: "note"; nodeId: string; message: string }
  // The language model failed. The call goes on without it where it can.
  | { type: "llmError"; nodeId: string; message: string }
  | { type: "transfer"; nodeId: string; phoneNumber: string; message: string }
  // The call was passed to another agent, which continues it with its own flow.
  | { type: "handoff"; nodeId: string; agentId: string; agentName: string; message: string }
  | { type: "end"; nodeId: string; message: string }
  // The flow can't continue, e.g. a step with nothing connected after it.
  | { type: "stuck"; nodeId?: string; message: string };

export interface TurnResult {
  state: ConversationState;
  events: ConversationEvent[];
}

export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;
export type CallSummary = z.infer<typeof CallSummarySchema>;
export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type ConversationAction = z.infer<typeof ConversationActionSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
export type StartTestCall = z.infer<typeof StartTestCallSchema>;
export type TestCallAction = z.infer<typeof TestCallActionSchema>;
export type ModelSpec = z.infer<typeof ModelSpecSchema>;
export type PromptPlaygroundRequest = z.infer<typeof PromptPlaygroundRequestSchema>;

/** What the agent says aloud during a turn, in order (for text-to-speech). */
export function spokenLines(events: ConversationEvent[]): string[] {
  return events.flatMap((event) => {
    switch (event.type) {
      case "say":
        return [event.text];
      case "ask":
        return [event.question];
      case "reask":
        return [event.question];
      case "aiResponse":
        return event.text ? [event.text] : [];
      case "transfer":
      case "handoff":
      case "end":
        return event.message ? [event.message] : [];
      default:
        return [];
    }
  });
}

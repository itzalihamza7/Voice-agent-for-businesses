import { z } from "zod";
import { ModelSpecSchema, type LlmCallInfo, type TranscriptEntry } from "./conversation";

// Evals: test cases for an agent, and the results of running them. A case is either
//   - "script": the caller's lines are fixed, and code checks what happened (path, answers,
//     words the agent must or must not say), or
//   - "simulated": a language model plays a caller with a persona and a goal, for a few turns.
// Either way an AI judge can grade the conversation against a rubric. The logic lives in
// @voice-agent/evals; these types are shared with the builder's Evals tab.

/** "£30|thirty" matches either. Checks ignore case. */
const PhraseList = z.array(z.string().trim().min(1).max(200)).max(20).default([]);

export const ScriptExpectationsSchema = z.object({
  /** How the call should stand after the last line: ended, transferred, or still going. */
  endsWith: z.enum(["end", "transfer", "stillTalking"]).optional(),
  /** Answers that must have been saved, e.g. { caller_name: "Ali Hamza" }. */
  variables: z.record(z.string(), z.string()).default({}),
  /** Phrases the agent must say at some point ("£30|thirty pounds": either one). */
  mustSay: PhraseList,
  /** Phrases the agent must never say. */
  mustNotSay: PhraseList,
  /** Steps the call must pass through, by step id. */
  visits: z.array(z.string()).max(20).default([]),
});

export const EvalCaseDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("script"),
    turns: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    expect: ScriptExpectationsSchema.default({
      variables: {},
      mustSay: [],
      mustNotSay: [],
      visits: [],
    }),
  }),
  z.object({
    kind: z.literal("simulated"),
    /** Who the caller is and how they talk. */
    persona: z.string().trim().min(1).max(1000),
    /** What the caller wants from the call. */
    goal: z.string().trim().min(1).max(500),
    maxTurns: z.number().int().min(1).max(15).default(8),
  }),
]);

export const NewEvalCaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  definition: EvalCaseDefinitionSchema,
  /** Extra things the judge checks for this case, e.g. "Never promises a discount". */
  criteria: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});

export const EvalModelsSchema = z.object({
  /** Runs the agent (Branch decisions and replies). */
  agent: ModelSpecSchema,
  /** Plays the caller in simulated cases. */
  caller: ModelSpecSchema,
  /** Grades the conversation. null = checks only, no judge. */
  judge: ModelSpecSchema.nullable(),
});

export const StartEvalRunSchema = z.object({
  version: z.number().int().positive(),
  models: EvalModelsSchema,
});

export const GoLiveSchema = z.object({ version: z.number().int().positive() });

export type ScriptExpectations = z.infer<typeof ScriptExpectationsSchema>;
export type EvalCaseDefinition = z.infer<typeof EvalCaseDefinitionSchema>;
export type NewEvalCase = z.infer<typeof NewEvalCaseSchema>;
export type EvalModels = z.infer<typeof EvalModelsSchema>;

export interface EvalCase extends NewEvalCase {
  id: string;
  agentId: string;
  createdAt: string;
}

/** One code check of a script case. */
export interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/** One rubric line of the judge: 0 = failed, 1 = partly, 2 = good. */
export interface JudgeScore {
  criterion: string;
  reason: string;
  score: 0 | 1 | 2;
}

export interface EvalCaseResult {
  caseId: string;
  name: string;
  passed: boolean;
  /** 0–1: the share of checks passed and of judge points, averaged. */
  score: number;
  transcript: TranscriptEntry[];
  checks: EvalCheck[];
  judge: JudgeScore[] | null;
  /** Something broke while running the case (not a failed check). */
  error?: string;
  llm: LlmCallInfo[];
  latencyMs: number;
}

export interface EvalRun {
  id: string;
  agentId: string;
  agentVersion: number;
  models: EvalModels;
  status: "running" | "done";
  /** 0–100, set when every case has run. */
  score: number | null;
  /** The cases this run covers, in order. */
  caseIds: string[];
  results: EvalCaseResult[];
  createdAt: string;
}

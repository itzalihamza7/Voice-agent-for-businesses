import type { LanguageModelProvider } from "@voice-agent/pipeline";
import type {
  ConversationAction,
  ConversationEvent,
  ConversationState,
  EvalCase,
  EvalCaseResult,
  EvalCheck,
  LlmCallInfo,
  TurnResult,
} from "@voice-agent/shared";
import { checkScript } from "./checks";
import { judgeConversation } from "./judge";
import { nextCallerLine } from "./simulated-caller";

// Runs one eval case against an agent and scores it. The agent is passed in as a function
// (the conversation engine with the version's flow, prompt and tools), so this package doesn't
// need to know how agents are loaded.

export type AgentTurn = (
  state: ConversationState | null,
  action: ConversationAction,
) => Promise<TurnResult>;

export interface CaseModels {
  /** Plays the caller in simulated cases. */
  caller: LanguageModelProvider;
  /** Grades the conversation. null = code checks only. */
  judge: LanguageModelProvider | null;
}

export interface CaseContext {
  businessName: string;
  /** The agent's business rules, so the judge knows what the agent was told. */
  rules: string;
}

/** A Branch with no AI answer would wait for a person to pick the path: an eval can't do that. */
const STUCK = "The agent is waiting for a path to be picked by hand.";

export async function runEvalCase(
  evalCase: EvalCase,
  agent: AgentTurn,
  models: CaseModels,
  context: CaseContext,
): Promise<EvalCaseResult> {
  const started = performance.now();
  const events: ConversationEvent[] = [];
  const llm: LlmCallInfo[] = [];
  // In an object so TypeScript sees it change inside `say`.
  const call: { state: ConversationState | null } = { state: null };
  let error: string | undefined;

  const say = async (action: ConversationAction) => {
    const result = await agent(call.state, action);
    call.state = result.state;
    events.push(...result.events);
    llm.push(...callsIn(result.events));
  };

  try {
    await say({ type: "start" });
    const definition = evalCase.definition;
    if (definition.kind === "script") {
      for (const line of definition.turns) {
        if (!canReply(call.state)) break;
        await say({ type: "reply", text: line });
      }
    } else {
      for (let turn = 0; turn < definition.maxTurns && canReply(call.state); turn++) {
        const next = await nextCallerLine(
          models.caller,
          definition,
          context.businessName,
          transcriptOf(call.state),
        );
        llm.push(next.llm);
        if (next.line) await say({ type: "reply", text: next.line });
        if (next.done) break;
      }
    }
    if (call.state?.waitingFor === "path") error = STUCK;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const transcript = transcriptOf(call.state);
  const checks: EvalCheck[] =
    evalCase.definition.kind === "script"
      ? checkScript(evalCase.definition.expect, call.state, events)
      : [];
  let judge: EvalCaseResult["judge"] = null;
  if (models.judge && transcript.length > 0 && !error) {
    try {
      const verdict = await judgeConversation(models.judge, {
        ...context,
        goal: evalCase.definition.kind === "simulated" ? evalCase.definition.goal : null,
        criteria: evalCase.criteria,
        transcript,
      });
      judge = verdict.scores;
      llm.push(verdict.llm);
    } catch (caught) {
      error = `The judge failed: ${caught instanceof Error ? caught.message : String(caught)}`;
    }
  }

  const { score, passed } = scoreCase(checks, judge, error);
  return {
    caseId: evalCase.id,
    name: evalCase.name,
    passed,
    score,
    transcript,
    checks,
    judge,
    ...(error ? { error } : {}),
    llm,
    latencyMs: Math.round(performance.now() - started),
  };
}

/**
 * A case's score is the share of checks passed and the share of judge points, averaged (each
 * only if there is one). It passes when every check passes and no judge line scored 0.
 */
export function scoreCase(
  checks: EvalCheck[],
  judge: EvalCaseResult["judge"],
  error?: string,
): { score: number; passed: boolean } {
  if (error) return { score: 0, passed: false };
  const parts: number[] = [];
  if (checks.length) parts.push(checks.filter((c) => c.passed).length / checks.length);
  if (judge?.length) parts.push(judge.reduce((sum, j) => sum + j.score, 0) / (judge.length * 2));
  const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 1;
  const passed = checks.every((c) => c.passed) && !(judge ?? []).some((j) => j.score === 0);
  return { score: Math.round(score * 1000) / 1000, passed };
}

/** The run's score, 0–100: the average case score. */
export function scoreRun(results: EvalCaseResult[]): number {
  if (results.length === 0) return 0;
  return Math.round((results.reduce((sum, r) => sum + r.score, 0) / results.length) * 1000) / 10;
}

function canReply(state: ConversationState | null): boolean {
  return state !== null && state.nodeId !== null && state.waitingFor !== "path";
}

function transcriptOf(state: ConversationState | null) {
  return state?.transcript ?? [];
}

/** Every language model request reported in the events (the agent's own AI work). */
function callsIn(events: ConversationEvent[]): LlmCallInfo[] {
  return events.flatMap((event) => ("llm" in event && event.llm ? [event.llm] : []));
}

import type { LanguageModelProvider } from "@voice-agent/pipeline";
import {
  BRANCH_ELSE_HANDLE,
  builtInVariables,
  DEFAULT_PROMPT_SETTINGS,
  renderTemplate,
  type PromptSettings,
  type AgentFlow,
  type ConversationAction,
  type ConversationEvent,
  type ConversationState,
  type FlowNode,
  type TranscriptEntry,
  type TurnResult,
} from "@voice-agent/shared";
import { llmCallInfo } from "./llm-info";
import { z } from "zod";
import { extractAnswer } from "./extraction";
import {
  aiResponsePrompt,
  branchDecisionPrompt,
  branchDecisionSchema,
  parseBranchAnswer,
} from "./prompts";

// Walks a conversation through a flow. The caller keeps the state between turns (the test
// chat keeps it in the browser), so nothing is stored here.
//
// Each turn runs steps automatically until the flow needs the caller:
//   - Ask: waits for the caller's answer, then stores it in the step's variable.
//   - Branch: with a decisions model, waits for what the caller says and lets the model pick
//     the path. Without one (or right after a Tool, whose result doesn't exist yet), the path
//     is picked by hand.
// AI response steps are written by the replies model when there is one. Tool and Knowledge
// lookup steps are only reported for now (roadmap phases 5 and 6).

// A loop of steps that never wait for the caller would otherwise run forever.
const MAX_STEPS_PER_TURN = 200;
// How often an Ask step asks again when the answer isn't understood, before moving on.
const MAX_REASKS = 2;

/** The action doesn't fit the conversation's state, e.g. an answer while waiting at a Branch. */
export class ConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationError";
  }
}

export interface ConversationDeps {
  /** Picks Branch paths. null = paths are picked by hand. */
  decisions: LanguageModelProvider | null;
  /** Writes AI response steps. null = they are only reported. */
  replies: LanguageModelProvider | null;
  /** The agent's prompt settings (prompt studio). Defaults when missing. */
  prompt?: PromptSettings;
  /** The current time, for {{today}}. Injectable so tests are repeatable. */
  now?: Date;
}

type BranchNode = Extract<FlowNode, { type: "branch" }>;

/** Everything one turn reads and changes. */
interface Turn {
  flow: AgentFlow;
  decisions: LanguageModelProvider | null;
  replies: LanguageModelProvider | null;
  prompt: PromptSettings;
  now: Date;
  /** {{business_name}}, {{today}}: usable everywhere, next to the collected answers. */
  builtIns: Record<string, string>;
  variables: Record<string, string>;
  transcript: TranscriptEntry[];
  events: ConversationEvent[];
}

function newTurn(
  flow: AgentFlow,
  deps: ConversationDeps,
  variables: Record<string, string>,
  transcript: TranscriptEntry[],
): Turn {
  const prompt = deps.prompt ?? DEFAULT_PROMPT_SETTINGS;
  const now = deps.now ?? new Date();
  return {
    flow,
    decisions: deps.decisions,
    replies: deps.replies,
    prompt,
    now,
    builtIns: builtInVariables(prompt, now),
    variables,
    transcript,
    events: [],
  };
}

/** Built-in variables plus the collected answers (answers win if a name is used twice). */
function templateVariables(turn: Turn): Record<string, string> {
  return { ...turn.builtIns, ...turn.variables };
}

export async function runTurn(
  flow: AgentFlow,
  state: ConversationState | null,
  action: ConversationAction,
  deps: ConversationDeps,
): Promise<TurnResult> {
  if (action.type === "start") {
    const turn = newTurn(flow, deps, {}, []);
    const start = flow.nodes.find((node) => node.type === "start");
    if (!start) {
      turn.events.push({ type: "stuck", message: "The flow has no Start step." });
      return finished(turn);
    }
    return continueAfter(turn, start, undefined);
  }

  if (!state || state.nodeId === null) throw new ConversationError("The call is already over.");
  const turn = newTurn(flow, deps, { ...state.variables }, [...state.transcript]);
  const node = flow.nodes.find((n) => n.id === state.nodeId);

  if (action.type === "reply") {
    if (node?.type === "ask" && state.waitingFor === "answer") {
      return answerAsk(turn, node, action.text, state.retries);
    }
    if (node?.type === "branch" && state.waitingFor === "callerMessage") {
      turn.transcript.push({ role: "caller", text: action.text });
      return decideBranch(turn, node);
    }
    throw new ConversationError("The agent isn't waiting for the caller to speak.");
  }

  // choosePath: picking by hand is allowed at any Branch, e.g. to override the AI.
  if (node?.type !== "branch") throw new ConversationError("The agent isn't at a Branch.");
  const path = branchPaths(node).find((p) => p.handle === action.handle);
  if (!path) throw new ConversationError(`This Branch has no path "${action.handle}".`);
  if (action.callerText) turn.transcript.push({ role: "caller", text: action.callerText });
  turn.events.push({ type: "pathChosen", nodeId: node.id, label: path.label, by: "you" });
  return continueAfter(turn, node, path.handle);
}

/** Follows the connection leaving `node` (through `handle` for Branches) and runs on from there. */
async function continueAfter(
  turn: Turn,
  node: FlowNode,
  handle: string | undefined,
): Promise<TurnResult> {
  let previous = node;
  let current = next(turn, node, handle);

  for (let steps = 0; current; steps++) {
    if (steps >= MAX_STEPS_PER_TURN) {
      turn.events.push({
        type: "stuck",
        nodeId: current.id,
        message: "The flow keeps looping without waiting for the caller.",
      });
      return finished(turn);
    }

    const fill = (template: string) => renderTemplate(template, templateVariables(turn));
    switch (current.type) {
      case "start":
        break;
      case "say": {
        const text = fill(current.data.text);
        agentSays(turn, text);
        turn.events.push({ type: "say", nodeId: current.id, text });
        break;
      }
      case "ask": {
        const question = fill(current.data.question);
        agentSays(turn, question);
        turn.events.push({
          type: "ask",
          nodeId: current.id,
          question,
          variable: current.data.variable,
        });
        return waiting(turn, current.id, "answer");
      }
      case "aiResponse":
        await writeAiResponse(turn, current);
        break;
      case "tool":
        turn.transcript.push({
          role: "system",
          text: `The tool "${current.data.toolName}" was called but returned NO RESULT (tools aren't connected yet). Nothing it would have returned is known, so don't state any of it.`,
        });
        turn.events.push({ type: "tool", nodeId: current.id, toolName: current.data.toolName });
        break;
      case "knowledgeLookup":
        turn.transcript.push({
          role: "system",
          text: "The knowledge base was searched but returned NO RESULT (it is empty). Don't state any facts it would have contained.",
        });
        turn.events.push({
          type: "knowledgeLookup",
          nodeId: current.id,
          query: fill(current.data.query),
        });
        break;
      case "branch":
        turn.events.push({ type: "branch", nodeId: current.id, paths: branchPaths(current) });
        // Without AI or keywords, a person has to pick the path.
        if (!turn.decisions && !hasKeywords(current)) return waiting(turn, current.id, "path");
        if (previous.type === "tool") {
          turn.events.push({
            type: "note",
            nodeId: current.id,
            message:
              "This choice depends on the tool's result, and tools aren't connected yet, so pick the path by hand.",
          });
          return waiting(turn, current.id, "path");
        }
        // Let the caller respond to what the agent just said before deciding.
        if (turn.transcript.at(-1)?.role !== "caller") {
          return waiting(turn, current.id, "callerMessage");
        }
        return decideBranch(turn, current);
      case "transfer": {
        const message = fill(current.data.message);
        if (message) agentSays(turn, message);
        turn.events.push({
          type: "transfer",
          nodeId: current.id,
          phoneNumber: current.data.phoneNumber,
          message,
        });
        return finished(turn);
      }
      case "end": {
        const message = fill(current.data.message);
        if (message) agentSays(turn, message);
        turn.events.push({ type: "end", nodeId: current.id, message });
        return finished(turn);
      }
    }
    previous = current;
    current = next(turn, current, undefined);
  }
  // `next` already explained why there is no next step.
  return finished(turn);
}

/** Saves the answer to an Ask step as a clean value, or asks again if it wasn't understood. */
async function answerAsk(
  turn: Turn,
  node: Extract<FlowNode, { type: "ask" }>,
  text: string,
  retries: number,
): Promise<TurnResult> {
  const { variable, answerType } = node.data;
  const question = renderTemplate(node.data.question, templateVariables(turn));
  turn.transcript.push({ role: "caller", text });

  // The decisions model understands answers: it is the one meant for short, exact jobs.
  let result: Awaited<ReturnType<typeof extractAnswer>>;
  try {
    result = await extractAnswer(answerType, text, {
      llm: turn.decisions,
      now: turn.now,
      question,
    });
  } catch (error) {
    turn.events.push({ type: "llmError", nodeId: node.id, message: errorMessage(error) });
    result = { ok: false, reason: "The AI couldn't read the answer." };
  }

  if (result.ok) {
    turn.variables[variable] = result.value;
    if (result.spoken) turn.variables[`${variable}_spoken`] = result.spoken;
    turn.events.push({
      type: "answer",
      nodeId: node.id,
      variable,
      value: result.value,
      raw: text,
      by: result.by,
      ...(result.llm ? { llm: result.llm } : {}),
    });
    return continueAfter(turn, node, undefined);
  }

  if (retries < MAX_REASKS) {
    const again = `Sorry, I didn't quite catch that. ${question}`;
    agentSays(turn, again);
    turn.events.push({
      type: "reask",
      nodeId: node.id,
      question: again,
      reason: result.reason,
      ...(result.llm ? { llm: result.llm } : {}),
    });
    return waiting(turn, node.id, "answer", retries + 1);
  }

  // Still not understood: keep what the caller said rather than trapping them in a loop.
  turn.variables[variable] = text;
  turn.events.push({
    type: "answer",
    nodeId: node.id,
    variable,
    value: text,
    raw: text,
    by: "gaveUp",
  });
  return continueAfter(turn, node, undefined);
}

/** Picks a Branch path from what the caller said (AI, or keyword rules without AI), then continues. */
async function decideBranch(turn: Turn, node: BranchNode): Promise<TurnResult> {
  const paths = branchPaths(node);
  const conditions = paths.filter((path) => path.handle !== BRANCH_ELSE_HANDLE);
  const callerSaid =
    [...turn.transcript].reverse().find((entry) => entry.role === "caller")?.text ?? "";
  const keywordPath = hasKeywords(node)
    ? (matchKeywords(node, callerSaid) ?? OTHERWISE)
    : undefined;

  if (!turn.decisions) {
    if (!keywordPath) return waiting(turn, node.id, "path");
    turn.events.push({
      type: "pathChosen",
      nodeId: node.id,
      label: keywordPath.label,
      by: "keywords",
    });
    return continueAfter(turn, node, keywordPath.handle);
  }

  try {
    const result = await turn.decisions.complete(
      branchDecisionPrompt(conditions, turn.transcript),
      {
        temperature: 0,
        jsonSchema: branchDecisionSchema(conditions.length),
      },
    );
    const decision = BranchDecisionSchema.safeParse(safeJson(result.text));
    // Structured output should always parse; reading a bare number is a fallback for models
    // that ignore the schema.
    const number = decision.success
      ? decision.data.path
      : parseBranchAnswer(result.text, conditions.length);
    const path = (number ? conditions[number - 1] : undefined) ?? OTHERWISE;
    turn.events.push({
      type: "pathChosen",
      nodeId: node.id,
      label: path.label,
      by: "ai",
      llm: llmCallInfo(result),
      aiAnswer: result.text,
      ...(decision.success ? { reason: decision.data.reason } : {}),
      ...(keywordPath ? { keywordGuess: keywordPath.label } : {}),
    });
    return continueAfter(turn, node, path.handle);
  } catch (error) {
    turn.events.push({ type: "llmError", nodeId: node.id, message: errorMessage(error) });
    turn.events.push({
      type: "note",
      nodeId: node.id,
      message: "The AI couldn't decide, so pick the path by hand.",
    });
    return waiting(turn, node.id, "path");
  }
}

const BranchDecisionSchema = z.object({ path: z.number().int().min(0), reason: z.string() });

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function hasKeywords(node: BranchNode): boolean {
  return node.data.conditions.some((condition) => condition.keywords.trim() !== "");
}

/** The first path with a keyword that appears as a whole word in what the caller said. */
function matchKeywords(node: BranchNode, text: string) {
  const said = text.toLowerCase();
  const index = node.data.conditions.findIndex((condition) =>
    condition.keywords
      .split(",")
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean)
      .some((word) =>
        new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(said),
      ),
  );
  return index >= 0 ? branchPaths(node)[index] : undefined;
}

async function writeAiResponse(turn: Turn, node: Extract<FlowNode, { type: "aiResponse" }>) {
  const instructions = node.data.instructions;
  if (!turn.replies) {
    turn.events.push({ type: "aiResponse", nodeId: node.id, instructions, text: null });
    return;
  }
  try {
    const result = await turn.replies.complete(
      aiResponsePrompt(turn.prompt, instructions, templateVariables(turn), turn.transcript),
      { temperature: 0.4 },
    );
    agentSays(turn, result.text);
    turn.events.push({
      type: "aiResponse",
      nodeId: node.id,
      instructions,
      text: result.text,
      llm: llmCallInfo(result),
    });
  } catch (error) {
    turn.events.push({ type: "llmError", nodeId: node.id, message: errorMessage(error) });
  }
}

/** The step after `node`, or undefined (with a "stuck" event explaining why). */
function next(turn: Turn, node: FlowNode, handle: string | undefined): FlowNode | undefined {
  const edge = turn.flow.edges.find(
    (e) => e.source === node.id && (handle === undefined || e.sourceHandle === handle),
  );
  const target = edge && turn.flow.nodes.find((n) => n.id === edge.target);
  if (!target) {
    turn.events.push({
      type: "stuck",
      nodeId: node.id,
      message: "Nothing is connected after this step, so the call can't continue.",
    });
  }
  return target;
}

const OTHERWISE = { handle: BRANCH_ELSE_HANDLE, label: "Otherwise" };

function branchPaths(node: BranchNode) {
  return [
    ...node.data.conditions.map((c, index) => ({
      handle: c.id,
      label: c.label.trim() || `Path ${index + 1}`,
    })),
    OTHERWISE,
  ];
}

function agentSays(turn: Turn, text: string) {
  turn.transcript.push({ role: "agent", text });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function waiting(
  turn: Turn,
  nodeId: string,
  waitingFor: NonNullable<ConversationState["waitingFor"]>,
  retries = 0,
): TurnResult {
  return {
    state: { nodeId, waitingFor, variables: turn.variables, transcript: turn.transcript, retries },
    events: turn.events,
  };
}

function finished(turn: Turn): TurnResult {
  return {
    state: {
      nodeId: null,
      waitingFor: null,
      variables: turn.variables,
      transcript: turn.transcript,
      retries: 0,
    },
    events: turn.events,
  };
}

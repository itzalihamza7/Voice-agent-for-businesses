import {
  llmCallInfo,
  type ChatMessage,
  type CompletionResult,
  type LanguageModelProvider,
  type ToolSpec,
} from "@voice-agent/pipeline";
import {
  renderTemplate,
  type ConversationEvent,
  type FlowNode,
  type LlmCallInfo,
  type TranscriptEntry,
} from "@voice-agent/shared";
import { checkArguments, missingArguments, type Tool, type ToolResult } from "@voice-agent/tools";
import type { CallContext } from "./context";
import { toolArgumentsPrompt } from "./prompts";

// Running tools during a conversation:
//   - Tool steps: arguments come from templates; the AI fills in missing ones (function calling).
//   - AI response steps with tools: the agentic loop. The model may call tools, read their
//     results and call again, up to MAX_TOOL_ROUNDS times, before it writes its reply.
// Every result goes into the transcript, so later steps (Branches, AI replies) can use it.

/** The parts of a conversation turn the tool runner reads and changes. */
export interface ToolTurn {
  tools: ReadonlyMap<string, Tool> | null;
  now: Date;
  variables: Record<string, string>;
  transcript: TranscriptEntry[];
  events: ConversationEvent[];
  /** What an AI request for this step sees of the call (within the context budget). */
  context(nodeId: string): CallContext;
}

const MAX_TOOL_ROUNDS = 4;
// Keeps a huge tool result from filling the model's context window.
const MAX_RESULT_CHARS = 2_000;

export function toolSpec(tool: Tool): ToolSpec {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

/** Runs a Tool step. Returns nothing: results land in the transcript, events and variables. */
export async function runToolStep(
  turn: ToolTurn,
  node: Extract<FlowNode, { type: "tool" }>,
  variables: Readonly<Record<string, string>>,
  llm: LanguageModelProvider | null,
): Promise<void> {
  const { toolName, saveAs } = node.data;
  const tool = turn.tools?.get(toolName);
  if (!tool) {
    record(
      turn,
      node.id,
      toolName,
      "step",
      {},
      { ok: false, error: `The tool "${toolName}" isn't available.` },
      0,
    );
    return;
  }

  // 1. Arguments from the step's templates. One that still contains a {{variable}} isn't known.
  const args: Record<string, unknown> = {};
  for (const [name, template] of Object.entries(node.data.arguments)) {
    const value = renderTemplate(template, variables).trim();
    if (value && !value.includes("{{")) args[name] = value;
  }

  // 2. Missing required arguments: the AI fills them in from the conversation.
  const filledByAi: string[] = [];
  let llmInfo: LlmCallInfo | undefined;
  const missing = missingArguments(tool.parameters, args);
  if (missing.length > 0 && llm) {
    try {
      const result = await llm.complete(
        toolArgumentsPrompt(tool, args, variables, turn.context(node.id)),
        { temperature: 0, tools: [toolSpec(tool)], toolChoice: { name: tool.name } },
      );
      llmInfo = llmCallInfo(result);
      const call = result.toolCalls?.find((c) => c.name === tool.name);
      const proposed = call ? parseObject(call.arguments) : null;
      for (const name of missing) {
        if (proposed?.[name] !== undefined && proposed[name] !== "") {
          args[name] = proposed[name];
          filledByAi.push(name);
        }
      }
    } catch (error) {
      turn.events.push({ type: "llmError", nodeId: node.id, message: errorText(error) });
    }
  }

  // 3. Check the arguments against the tool's schema, then call it.
  const started = performance.now();
  const checked = checkArguments(tool.parameters, args);
  const result: ToolResult = checked.ok
    ? await tool.execute(checked.args, { now: turn.now })
    : { ok: false, error: checked.error };
  record(
    turn,
    node.id,
    toolName,
    "step",
    checked.ok ? checked.args : args,
    result,
    performance.now() - started,
    filledByAi,
    llmInfo,
  );

  // 4. "Save result as": the result's fields become variables, e.g. {{booking_reference}},
  // plus {{booking_ok}} (true/false) and {{booking_error}}, so Branch rules can test the outcome.
  if (saveAs) {
    turn.variables[`${saveAs}_ok`] = String(result.ok);
    turn.variables[`${saveAs}_error`] = result.ok ? "" : result.error;
  }
  if (result.ok && saveAs) {
    for (const [key, value] of Object.entries(result.data)) {
      const text = Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object"
          ? null
          : String(value);
      if (text !== null) turn.variables[`${saveAs}_${key}`] = text;
    }
  }
}

/**
 * The agentic loop for an AI response step with tools: the model may call tools and see their
 * results before it writes the reply. Returns the reply and the summed cost of all rounds.
 */
export async function replyWithTools(
  turn: ToolTurn,
  nodeId: string,
  llm: LanguageModelProvider,
  messages: ChatMessage[],
  allowed: readonly Tool[],
): Promise<{ text: string; llm: LlmCallInfo }> {
  const specs = allowed.map(toolSpec);
  const rounds: CompletionResult[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // The last round offers no tools, so the model has to answer in words.
    const offerTools = specs.length > 0 && round < MAX_TOOL_ROUNDS;
    const result = await llm.complete(messages, {
      temperature: 0.4,
      ...(offerTools ? { tools: specs, toolChoice: "auto" as const } : {}),
    });
    rounds.push(result);
    if (!offerTools || !result.toolCalls?.length) {
      return { text: result.text, llm: sumCalls(rounds) };
    }

    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
    for (const call of result.toolCalls) {
      const tool = allowed.find((t) => t.name === call.name);
      const args = parseObject(call.arguments) ?? {};
      const started = performance.now();
      const checked = tool ? checkArguments(tool.parameters, args) : null;
      const outcome: ToolResult = !tool
        ? { ok: false, error: `The tool "${call.name}" isn't allowed in this step.` }
        : checked?.ok
          ? await tool.execute(checked.args, { now: turn.now })
          : { ok: false, error: checked && !checked.ok ? checked.error : "Invalid arguments" };
      record(turn, nodeId, call.name, "ai", args, outcome, performance.now() - started);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify(outcome.ok ? outcome.data : { error: outcome.error }).slice(
          0,
          MAX_RESULT_CHARS,
        ),
      });
    }
  }
  // Not reached: the last round always returns.
  throw new Error("Tool loop ended without a reply.");
}

function record(
  turn: ToolTurn,
  nodeId: string,
  toolName: string,
  by: "step" | "ai",
  args: Record<string, unknown>,
  result: ToolResult,
  latencyMs: number,
  filledByAi: string[] = [],
  llm?: LlmCallInfo,
) {
  turn.events.push({
    type: "toolCall",
    nodeId,
    toolName,
    by,
    arguments: args,
    ok: result.ok,
    ...(result.ok ? { result: result.data } : { error: result.error }),
    latencyMs: Math.round(latencyMs),
    ...(filledByAi.length ? { filledByAi } : {}),
    ...(llm ? { llm } : {}),
  });
  turn.transcript.push({
    role: "system",
    text: result.ok
      ? `The tool "${toolName}" was called with ${JSON.stringify(args)} and returned: ${JSON.stringify(result.data).slice(0, MAX_RESULT_CHARS)}`
      : `The tool "${toolName}" failed: ${result.error}. Don't guess what it would have returned.`,
  });
}

/** One summary of several model requests: total time, tokens and cost, model of the last one. */
function sumCalls(results: CompletionResult[]): LlmCallInfo {
  const infos = results.map(llmCallInfo);
  const sum = (pick: (info: LlmCallInfo) => number | null) =>
    infos.every((info) => pick(info) === null)
      ? null
      : infos.reduce((total, info) => total + (pick(info) ?? 0), 0);
  const last = infos.at(-1)!;
  return {
    ...last,
    latencyMs: infos.reduce((total, info) => total + info.latencyMs, 0),
    inputTokens: sum((info) => info.inputTokens),
    outputTokens: sum((info) => info.outputTokens),
    cachedInputTokens: sum((info) => info.cachedInputTokens),
    costUsd: sum((info) => info.costUsd),
  };
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text || "{}");
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

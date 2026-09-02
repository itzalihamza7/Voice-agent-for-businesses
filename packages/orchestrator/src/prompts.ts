import type { ChatMessage } from "@voice-agent/pipeline";
import { buildSystemPrompt, type PromptSettings } from "@voice-agent/shared";
import { formatContext, type CallContext } from "./context";

// The prompts the conversation engine sends to the language model. Kept in one file so they
// are easy to read and change. (Roadmap phase 3, the prompt studio, makes them editable per agent.)

/** The answer for "no path fits" in Branch decisions. */
export const NONE_OF_THESE = "None of these";

/**
 * The texts the model chooses from: the path labels (numbered only if two are the same).
 * The model copies a label instead of picking a number: in testing, a label was never worse
 * than a number and fixed cases where a model reasoned "no booking" and then wrote path 1.
 */
export function branchChoices(paths: { label: string }[]): string[] {
  const labels = paths.map((path) => path.label);
  const unique = new Set(labels).size === labels.length && !labels.includes(NONE_OF_THESE);
  return unique ? labels : labels.map((label, index) => `${index + 1}. ${label}`);
}

/** Asks the model which Branch path fits. It answers with JSON: a reason, then the path's text. */
export function branchDecisionPrompt(
  paths: { label: string }[],
  context: CallContext,
  /** A tool result the decision is about (a Branch right after a Tool step). */
  toolResult?: string,
): ChatMessage[] {
  const options = [...branchChoices(paths), NONE_OF_THESE]
    .map((choice) => `- ${choice}`)
    .join("\n");
  return [
    {
      role: "system",
      content: [
        "You route a phone call that an AI agent is handling.",
        "Read the conversation and decide which path the call should take next,",
        "based on what the caller said last, or on a tool's result if one was just called.",
        "",
        "Paths:",
        options,
        "",
        'Answer with JSON: first "reason", a short explanation of what the caller wants, then',
        '"path": copy the text of the path that fits that reason.',
      ].join("\n"),
    },
    {
      role: "user",
      content: toolResult
        ? `${formatContext(context)}\n\nThis decision is about the result of the tool that was just called. Read its fields carefully (true/false values matter):\n${toolResult}`
        : formatContext(context),
    },
  ];
}

/** Structured output for Branch decisions: "path" must be one of the offered texts. */
export function branchDecisionSchema(paths: { label: string }[]) {
  return {
    name: "branch_decision",
    schema: {
      type: "object",
      additionalProperties: false,
      // "reason" comes first on purpose: models write JSON in order, so the model explains
      // before it commits to a path. With the path first, the reason was written after the
      // decision and sometimes contradicted it.
      required: ["reason", "path"],
      properties: {
        reason: { type: "string" },
        path: { type: "string", enum: [...branchChoices(paths), NONE_OF_THESE] },
      },
    },
  };
}

/**
 * Asks the model to write the agent's next spoken reply for an AI response step. The system
 * prompt is built from the agent's prompt settings (see buildSystemPrompt in @voice-agent/shared).
 *
 * The conversation goes in as one transcript inside a single user message, not as separate
 * chat turns. Chat templates differ between models: Llama, for example, mis-handles a
 * conversation that ends with a system message (our tool notes) and writes its own
 * "assistant" header into the reply. One transcript behaves the same on every model.
 */
export function aiResponsePrompt(
  settings: PromptSettings,
  instructions: string,
  variables: Readonly<Record<string, string>>,
  context: CallContext,
  withTools = false,
  /** Facts remembered about the caller from earlier calls. */
  memory: string[] = [],
): ChatMessage[] {
  const system = buildSystemPrompt(settings, { instructions, variables });
  const parts = [system];
  if (withTools) {
    parts.push(
      "When a tool can give you information you need (such as free times or booking details), call it instead of guessing. Dates are YYYY-MM-DD, times HH:MM (24-hour).",
    );
  }
  if (memory.length) {
    parts.push(
      [
        "What you remember about this caller from earlier calls (it may be out of date; use it naturally, don't read it out):",
        ...memory.map((fact) => `- ${fact}`),
      ].join("\n"),
    );
  }
  return [
    { role: "system", content: parts.join("\n\n") },
    {
      role: "user",
      content: `${formatContext(context)}\n\nWrite only the agent's next reply.`,
    },
  ];
}

/** Reads the path number from the model's answer. 0, or anything unreadable, means "Otherwise". */
export function parseBranchAnswer(answer: string, pathCount: number): number | null {
  const match = /\d+/.exec(answer);
  if (!match) return null;
  const number = Number(match[0]);
  return number >= 1 && number <= pathCount ? number : null;
}

/** Asks the model to fill in a tool's missing arguments from the conversation (function calling). */
export function toolArgumentsPrompt(
  tool: { name: string; description: string },
  given: Record<string, unknown>,
  variables: Readonly<Record<string, string>>,
  context: CallContext,
): ChatMessage[] {
  const known = Object.entries(variables).map(([name, value]) => `- ${name}: ${value}`);
  return [
    {
      role: "system",
      content: [
        `Call the tool "${tool.name}" (${tool.description}).`,
        "Fill in its arguments from the conversation and the known values. Prefer the known",
        "values: they are already checked. Dates are YYYY-MM-DD, times HH:MM (24-hour).",
        Object.keys(given).length ? `Already set: ${JSON.stringify(given)}` : "",
        "",
        "Known values:",
        ...(known.length ? known : ["- none"]),
      ].join("\n"),
    },
    { role: "user", content: formatContext(context) },
  ];
}

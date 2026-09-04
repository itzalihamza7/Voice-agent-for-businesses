import { llmCallInfo, type LanguageModelProvider } from "@voice-agent/pipeline";
import {
  builtInVariables,
  buildSystemPrompt,
  type LlmCallInfo,
  type PromptSettings,
} from "@voice-agent/shared";
import { buildContext } from "./context";
import { aiResponsePrompt } from "./prompts";

// Prompt playground: runs one AI reply with given prompt settings, so two versions of a prompt
// can be compared on exactly the same input.

export interface PlaygroundInput {
  prompt: PromptSettings;
  /** The AI response step's instructions. */
  instructions: string;
  /** What the caller just said. */
  callerMessage: string;
  /** Answers collected earlier in the call, e.g. { caller_name: "Ali" }. */
  variables: Record<string, string>;
  now?: Date;
}

export interface PlaygroundResult {
  systemPrompt: string;
  reply: string;
  llm: LlmCallInfo;
}

export async function runPromptPlayground(
  llm: LanguageModelProvider,
  input: PlaygroundInput,
): Promise<PlaygroundResult> {
  const variables = {
    ...builtInVariables(input.prompt, input.now ?? new Date()),
    ...input.variables,
  };
  const context = buildContext([{ role: "caller", text: input.callerMessage }], null, Infinity);
  const result = await llm.complete(
    aiResponsePrompt(input.prompt, input.instructions, variables, context),
    { temperature: 0.4 },
  );
  return {
    systemPrompt: buildSystemPrompt(input.prompt, { instructions: input.instructions, variables }),
    reply: result.text,
    llm: llmCallInfo(result),
  };
}

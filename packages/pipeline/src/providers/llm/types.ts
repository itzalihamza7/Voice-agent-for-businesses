// Language model: decides what the agent says next, based on the conversation so far.
// Implementations: mock.ts (tests), openai-compatible.ts (OpenAI and Ollama) and
// fallback.ts (tries a backup model when the main one fails).
// Tool calls and structured output are options of `complete`; so is streaming (onToken).

/** A function the model asked to call. `arguments` is a JSON string, as the model wrote it. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  // toolCalls: the assistant asked for these tools (their results follow as "tool" messages).
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/** A tool the model may call: name, what it does, and a JSON Schema for its arguments. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CompletionOptions {
  /** 0 = always the most likely answer (good for decisions); higher = more varied wording. */
  temperature?: number;
  /**
   * Structured output: the reply must be JSON matching this JSON Schema. The provider
   * guarantees the shape, not the content (formats, dates, ...): always validate the result.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Tools the model may call. Its reply then has toolCalls instead of (or with) text. */
  tools?: ToolSpec[];
  /**
   * "auto" = the model decides, "none" = answer in text, "required" = must call one of the tools,
   * { name } = must call that tool.
   */
  toolChoice?: "auto" | "none" | "required" | { name: string };
  /**
   * Streams the reply: called with each piece of text as the model writes it. Only for plain
   * text replies (no tools, no jsonSchema); providers that can't stream simply don't call it.
   * The result still has the whole text.
   */
  onToken?: (text: string) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache (cheaper). Included in inputTokens. */
  cachedInputTokens: number;
}

export interface CompletionResult {
  text: string;
  /** The exact model that answered, e.g. "gpt-4.1-mini-2025-04-14" or "qwen3:8b". */
  model: string;
  /** Wall-clock time of the whole request, including retries. */
  latencyMs: number;
  /** Token counts, when the provider reports them. */
  usage: TokenUsage | null;
  /** Estimated price in US dollars. 0 for local models, null when the price is unknown. */
  costUsd: number | null;
  /** Set when the main model failed and a fallback model answered instead. */
  fellBackFrom?: { model: string; error: string };
  /** Tools the model wants called. Run them and send the results back as "tool" messages. */
  toolCalls?: ToolCall[];
  /**
   * The model counted far fewer prompt tokens than were sent: its context window cut the
   * prompt. Ollama does this without an error, dropping the start (the system prompt) first.
   */
  promptCut?: boolean;
}

export interface LanguageModelProvider {
  readonly name: string;
  /** The model this provider asks for, e.g. "gpt-4.1-mini". */
  readonly model: string;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}

/** The provider failed after its retries (network error, timeout, HTTP error, bad response). */
export class LanguageModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LanguageModelError";
  }
}

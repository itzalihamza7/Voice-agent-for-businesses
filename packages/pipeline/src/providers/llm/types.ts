// Language model: decides what the agent says next, based on the conversation so far.
// Implementations: mock.ts (tests) and openai-compatible.ts (OpenAI and Ollama).
// Streaming tokens and tool calls will be added here later.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  /** 0 = always the most likely answer (good for decisions); higher = more varied wording. */
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  /** The exact model that answered, e.g. "gpt-4.1-mini" or "llama3.1:8b". */
  model: string;
  /** Wall-clock time of the whole request, including retries. */
  latencyMs: number;
  /** Token counts, when the provider reports them. */
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface LanguageModelProvider {
  readonly name: string;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}

/** The provider failed after its retries (network error, timeout, HTTP error, bad response). */
export class LanguageModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LanguageModelError";
  }
}

import {
  LanguageModelError,
  type ChatMessage,
  type CompletionOptions,
  type CompletionResult,
  type LanguageModelProvider,
} from "./types";

// Tries the main model first; if it fails (after its own retries), asks the fallback model.
// Typical use: a free local model first, a hosted model as a backup when Ollama isn't running.
// The result records that a fallback happened, so it is visible instead of silent.
export class FallbackLanguageModel implements LanguageModelProvider {
  readonly name: string;
  readonly model: string;

  constructor(
    private readonly main: LanguageModelProvider,
    private readonly fallback: LanguageModelProvider,
  ) {
    this.name = main.name;
    this.model = main.model;
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
    try {
      return await this.main.complete(messages, options);
    } catch (error) {
      if (!(error instanceof LanguageModelError)) throw error;
      // The fallback answers in one piece: part of the main model's reply may already have been
      // streamed, and the whole result replaces it.
      const { onToken: _onToken, ...rest } = options ?? {};
      const result = await this.fallback.complete(messages, rest);
      return { ...result, fellBackFrom: { model: this.main.model, error: error.message } };
    }
  }
}

import type {
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  LanguageModelProvider,
} from "./types";

// Fake LLM for tests and local development. Always gives the same reply.
export class MockLanguageModelProvider implements LanguageModelProvider {
  readonly name = "mock";

  async complete(
    _messages: ChatMessage[],
    _options?: CompletionOptions,
  ): Promise<CompletionResult> {
    return {
      text: "Sure, I can help with that. What is your order number?",
      model: "mock",
      latencyMs: 0,
      usage: null,
    };
  }
}

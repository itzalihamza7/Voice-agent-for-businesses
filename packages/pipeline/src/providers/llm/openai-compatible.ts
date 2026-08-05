import { z } from "zod";
import {
  LanguageModelError,
  type ChatMessage,
  type CompletionOptions,
  type CompletionResult,
  type LanguageModelProvider,
} from "./types";

// Talks to any server that speaks OpenAI's Chat Completions API. That covers OpenAI itself and
// Ollama (http://localhost:11434/v1), so one class lets us compare a hosted and a local model.
// Plain fetch on purpose (no SDK) so the HTTP request is easy to see and learn from.

export interface OpenAICompatibleConfig {
  /** Registry name, e.g. "openai" or "ollama". Used in error messages. */
  name: string;
  /** API root, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  model: string;
  /** Sent as a Bearer token. Ollama doesn't need one. */
  apiKey?: string;
  /** Per attempt. Local models can be slow on the first request while they load. */
  timeoutMs?: number;
  /** Extra attempts after a failure that might be temporary (network, timeout, 429, 5xx). */
  maxRetries?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

// Only the parts of the response we use. Anything else the server sends is ignored.
const ResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

export class OpenAICompatibleProvider implements LanguageModelProvider {
  readonly name: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.fetch = config.fetch ?? globalThis.fetch;
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const { baseUrl, model, apiKey, timeoutMs = 60_000, maxRetries = 2 } = this.config;
    const started = performance.now();

    for (let attempt = 0; ; attempt++) {
      let failure: string;
      try {
        const response = await this.fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ model, messages, temperature: options.temperature }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          const parsed = ResponseSchema.safeParse(await response.json());
          if (!parsed.success)
            throw new LanguageModelError(`${this.name}: unexpected response shape`);
          const body = parsed.data;
          return {
            text: (body.choices[0]?.message.content ?? "").trim(),
            model: body.model,
            latencyMs: Math.round(performance.now() - started),
            usage: body.usage
              ? {
                  inputTokens: body.usage.prompt_tokens,
                  outputTokens: body.usage.completion_tokens,
                }
              : null,
          };
        }

        const detail = (await response.text()).slice(0, 300);
        failure = `HTTP ${response.status}: ${detail}`;
        // 4xx (except 429 "too many requests") means the request itself is wrong: retrying won't help.
        if (response.status < 500 && response.status !== 429) {
          throw new LanguageModelError(`${this.name} rejected the request (${failure})`);
        }
      } catch (error) {
        if (error instanceof LanguageModelError) throw error;
        // Network error or timeout: possibly temporary.
        failure = error instanceof Error ? error.message : String(error);
      }

      if (attempt >= maxRetries) {
        throw new LanguageModelError(
          `${this.name} failed after ${attempt + 1} attempts (${failure})`,
        );
      }
      // Exponential backoff: 0.5 s, 1 s, 2 s...
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

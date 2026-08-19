import { z } from "zod";
import {
  LanguageModelError,
  type ToolCall,
  type ChatMessage,
  type CompletionOptions,
  type CompletionResult,
  type LanguageModelProvider,
  type TokenUsage,
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
  /**
   * Sent as `reasoning_effort` when set. "none" switches off the hidden "thinking" step of
   * reasoning models such as Qwen 3, which otherwise adds seconds to every reply.
   */
  reasoningEffort?: string;
  /** Price of one request from its token usage. Without it the cost is unknown (null). */
  estimateCost?: (usage: TokenUsage | null) => number | null;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

// Only the parts of the response we use. Anything else the server sends is ignored.
const ResponseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().optional() }).nullish(),
    })
    .nullish(),
});

export class OpenAICompatibleProvider implements LanguageModelProvider {
  readonly name: string;
  readonly model: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.model = config.model;
    this.fetch = config.fetch ?? globalThis.fetch;
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {},
  ): Promise<CompletionResult> {
    const {
      baseUrl,
      model,
      apiKey,
      reasoningEffort,
      timeoutMs = 60_000,
      maxRetries = 2,
    } = this.config;
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
          body: JSON.stringify({
            model,
            messages: messages.map(toWire),
            tools: options.tools?.map((tool) => ({ type: "function", function: tool })),
            tool_choice: toolChoice(options),
            temperature: options.temperature,
            reasoning_effort: reasoningEffort,
            response_format: options.jsonSchema && {
              type: "json_schema",
              json_schema: { ...options.jsonSchema, strict: true },
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          const parsed = ResponseSchema.safeParse(await response.json());
          if (!parsed.success)
            throw new LanguageModelError(`${this.name}: unexpected response shape`);
          const body = parsed.data;
          const toolCalls = body.choices[0]?.message.tool_calls?.map((call) => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          }));
          const usage: TokenUsage | null = body.usage
            ? {
                inputTokens: body.usage.prompt_tokens,
                outputTokens: body.usage.completion_tokens,
                cachedInputTokens: body.usage.prompt_tokens_details?.cached_tokens ?? 0,
              }
            : null;
          return {
            text: (body.choices[0]?.message.content ?? "").trim(),
            model: body.model,
            latencyMs: Math.round(performance.now() - started),
            usage,
            costUsd: this.config.estimateCost?.(usage) ?? null,
            ...(toolCalls?.length ? { toolCalls } : {}),
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

/** Our chat messages in the OpenAI wire format (tool calls and tool results included). */
function toWire(message: ChatMessage) {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call: ToolCall) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function toolChoice(options: CompletionOptions) {
  const choice = options.toolChoice;
  if (!choice || !options.tools?.length) return undefined;
  return typeof choice === "string"
    ? choice
    : { type: "function", function: { name: choice.name } };
}

import { estimateTokens } from "@voice-agent/shared";
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
// With onToken (plain text replies only) the reply is streamed as server-sent events.

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
    const streaming = Boolean(options.onToken) && !options.tools?.length && !options.jsonSchema;
    // Once text has gone out, a retry would repeat it: fail instead.
    let streamed = false;

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
            ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok && streaming && response.body) {
          const {
            text,
            model: answeredBy,
            usage,
          } = await readStream(response.body, (piece) => {
            streamed = true;
            options.onToken!(piece);
          });
          return {
            text: text.trim(),
            model: answeredBy ?? model,
            latencyMs: Math.round(performance.now() - started),
            usage,
            costUsd: this.config.estimateCost?.(usage) ?? null,
            ...(usage && wasCut(messages, usage.inputTokens) ? { promptCut: true } : {}),
          };
        }

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
            ...(usage && wasCut(messages, usage.inputTokens) ? { promptCut: true } : {}),
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

      if (attempt >= maxRetries || streamed) {
        throw new LanguageModelError(
          `${this.name} failed after ${attempt + 1} attempts (${failure})`,
        );
      }
      // Exponential backoff: 0.5 s, 1 s, 2 s...
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

const StreamChunkSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() })),
  usage: ResponseSchema.shape.usage,
});

/** Reads a streamed reply (server-sent events), passing each piece of text on as it arrives. */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<{ text: string; model: string | null; usage: TokenUsage | null }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model: string | null = null;
  let usage: TokenUsage | null = null;
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = StreamChunkSchema.safeParse(safeParse(data));
    if (!chunk.success) return;
    model ??= chunk.data.model ?? null;
    const piece = chunk.data.choices[0]?.delta?.content;
    if (piece) {
      text += piece;
      onText(piece);
    }
    if (chunk.data.usage) {
      usage = {
        inputTokens: chunk.data.usage.prompt_tokens,
        outputTokens: chunk.data.usage.completion_tokens,
        cachedInputTokens: chunk.data.usage.prompt_tokens_details?.cached_tokens ?? 0,
      };
    }
  };
  for await (const bytes of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  return { text, model, usage };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
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

/**
 * True when the model saw much less of the prompt than was sent. Token counts differ between
 * tokenizers, so only a big gap counts: in testing, Ollama (4,096-token window) reported 2,050
 * tokens for a ~6,000-token prompt and ignored the system prompt's instruction.
 */
function wasCut(messages: ChatMessage[], reportedTokens: number): boolean {
  const sent = estimateTokens(messages.map((message) => message.content).join("\n"));
  return sent >= MIN_TOKENS_TO_CHECK && reportedTokens < sent * CUT_RATIO;
}

const MIN_TOKENS_TO_CHECK = 200;
const CUT_RATIO = 0.6;

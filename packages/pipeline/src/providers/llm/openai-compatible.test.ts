import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { LanguageModelError } from "./types";

const okBody = {
  model: "test-model-1",
  choices: [{ message: { content: "  Hello there.  " } }],
  usage: { prompt_tokens: 12, completion_tokens: 3 },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider(fetchMock: typeof fetch, apiKey?: string) {
  return new OpenAICompatibleProvider({
    name: "test",
    baseUrl: "https://llm.example/v1",
    model: "test-model",
    apiKey,
    maxRetries: 2,
    fetch: fetchMock,
  });
}

describe("OpenAICompatibleProvider", () => {
  it("sends a Chat Completions request and reads text, model and token usage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(okBody));
    const result = await provider(fetchMock, "secret").complete([{ role: "user", content: "Hi" }], {
      temperature: 0,
    });

    expect(result).toMatchObject({
      text: "Hello there.",
      model: "test-model-1",
      usage: { inputTokens: 12, outputTokens: 3, cachedInputTokens: 0 },
      costUsd: null,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0,
    });
  });

  it("sends reasoning_effort when set, and reports cached tokens and cost", async () => {
    const body = {
      ...okBody,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 10,
        prompt_tokens_details: { cached_tokens: 40 },
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(body));
    const llm = new OpenAICompatibleProvider({
      name: "test",
      baseUrl: "https://llm.example/v1",
      model: "test-model",
      reasoningEffort: "none",
      estimateCost: (usage) => (usage ? usage.inputTokens / 1000 : null),
      fetch: fetchMock,
    });
    const result = await llm.complete([{ role: "user", content: "Hi" }]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).reasoning_effort).toBe("none");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 });
    expect(result.costUsd).toBe(0.1);
  });

  it("asks for structured output with a strict JSON schema", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(okBody));
    const schema = { type: "object", properties: { found: { type: "boolean" } } };
    await provider(fetchMock).complete([{ role: "user", content: "Hi" }], {
      jsonSchema: { name: "extraction", schema },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "extraction", schema, strict: true },
    });
  });

  it("offers tools, sends tool calls and results back, and reads the tool calls in a reply", async () => {
    const reply = {
      model: "m",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "c1",
                function: { name: "checkAvailability", arguments: '{"date":"2026-10-23"}' },
              },
            ],
          },
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(reply));
    const tool = {
      name: "checkAvailability",
      description: "Free times",
      parameters: { type: "object" },
    };
    const result = await provider(fetchMock).complete(
      [
        { role: "user", content: "Friday?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "c0", name: "checkAvailability", arguments: "{}" }],
        },
        { role: "tool", toolCallId: "c0", content: '{"freeTimes":[]}' },
      ],
      { tools: [tool], toolChoice: { name: "checkAvailability" } },
    );

    expect(result.toolCalls).toEqual([
      { id: "c1", name: "checkAvailability", arguments: '{"date":"2026-10-23"}' },
    ]);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.tools).toEqual([{ type: "function", function: tool }]);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "checkAvailability" } });
    expect(body.messages[1].tool_calls[0]).toEqual({
      id: "c0",
      type: "function",
      function: { name: "checkAvailability", arguments: "{}" },
    });
    expect(body.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "c0",
      content: '{"freeTimes":[]}',
    });
  });

  it("sends no authorization header without an API key (Ollama)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(okBody));
    await provider(fetchMock).complete([{ role: "user", content: "Hi" }]);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has("authorization")).toBe(false);
  });

  it("retries temporary failures (5xx, 429, network) and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ error: "busy" }, 503))
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(json(okBody));
      const promise = provider(fetchMock).complete([{ role: "user", content: "Hi" }]);
      await vi.runAllTimersAsync();
      expect((await promise).text).toBe("Hello there.");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after the last retry", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn<typeof fetch>()
        // A new Response per call: a response body can only be read once.
        .mockImplementation(async () => json({ error: "rate limited" }, 429));
      const promise = provider(fetchMock).complete([{ role: "user", content: "Hi" }]);
      const assertion = expect(promise).rejects.toThrow("failed after 3 attempts (HTTP 429");
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a request the server rejects (4xx)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "bad key" }, 401));
    await expect(provider(fetchMock).complete([{ role: "user", content: "Hi" }])).rejects.toThrow(
      LanguageModelError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a response without choices", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ model: "m", choices: [] }));
    await expect(provider(fetchMock).complete([{ role: "user", content: "Hi" }])).rejects.toThrow(
      "unexpected response shape",
    );
  });
});

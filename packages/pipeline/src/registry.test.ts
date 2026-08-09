import { describe, expect, it, vi } from "vitest";
import { createLanguageModel, listLanguageModels, ProviderConfigError } from "./registry";

const env = {
  OLLAMA_BASE_URL: "http://ollama.test:11434/v1",
  OLLAMA_MODEL: "qwen3:8b",
  OPENAI_API_KEY: "sk-test",
  OPENAI_MODELS: "gpt-4.1-mini, gpt-4.1-nano",
};

describe("createLanguageModel", () => {
  it("uses the requested model, or the configured default", () => {
    expect(createLanguageModel({ provider: "ollama", model: "llama3.1:8b" }, env).model).toBe(
      "llama3.1:8b",
    );
    expect(createLanguageModel({ provider: "ollama" }, env).model).toBe("qwen3:8b");
  });

  it("only allows the configured OpenAI models", () => {
    expect(createLanguageModel({ provider: "openai", model: "gpt-4.1-nano" }, env).model).toBe(
      "gpt-4.1-nano",
    );
    expect(() => createLanguageModel({ provider: "openai", model: "gpt-4.1" }, env)).toThrow(
      ProviderConfigError,
    );
  });

  it("needs an API key for OpenAI and a known provider name", () => {
    expect(() => createLanguageModel({ provider: "openai" }, {})).toThrow(
      "OPENAI_API_KEY is not set",
    );
    expect(() => createLanguageModel({ provider: "nope" }, env)).toThrow(
      'Unknown llm provider "nope"',
    );
  });
});

describe("listLanguageModels", () => {
  it("lists installed Ollama models and the allowed OpenAI models", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        models: [
          { name: "qwen3:8b", details: { parameter_size: "8.2B", quantization_level: "Q4_K_M" } },
        ],
      }),
    );
    const { models, problems } = await listLanguageModels(env, fetchMock);
    expect(fetchMock.mock.calls[0]![0]).toBe("http://ollama.test:11434/api/tags");
    expect(models).toEqual([
      { provider: "ollama", model: "qwen3:8b", label: "qwen3:8b (local, 8.2B Q4_K_M)" },
      { provider: "openai", model: "gpt-4.1-mini", label: "gpt-4.1-mini (OpenAI)" },
      { provider: "openai", model: "gpt-4.1-nano", label: "gpt-4.1-nano (OpenAI)" },
    ]);
    expect(problems).toEqual([]);
  });

  it("explains what is missing instead of failing", async () => {
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const { models, problems } = await listLanguageModels(
      { OLLAMA_BASE_URL: env.OLLAMA_BASE_URL },
      down,
    );
    expect(models).toEqual([]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("Ollama isn't reachable");
  });
});

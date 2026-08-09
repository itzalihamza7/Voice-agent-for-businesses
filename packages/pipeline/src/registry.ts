import type { ModelSpec, ModelOption, ProviderSelection } from "@voice-agent/shared";
import { MockLanguageModelProvider } from "./providers/llm/mock";
import { OpenAICompatibleProvider } from "./providers/llm/openai-compatible";
import { openAiCostUsd } from "./providers/llm/pricing";
import type { LanguageModelProvider } from "./providers/llm/types";
import { MockSpeechToTextProvider } from "./providers/stt/mock";
import type { SpeechToTextProvider } from "./providers/stt/types";
import { MockTextToSpeechProvider } from "./providers/tts/mock";
import type { TextToSpeechProvider } from "./providers/tts/types";

// Maps provider names (from an agent config) to implementations.
// To add a vendor: implement the interface, then add one entry to the matching map.
// Settings such as API keys and model names come from environment variables (see .env.example).

export interface Providers {
  stt: SpeechToTextProvider;
  llm: LanguageModelProvider;
  tts: TextToSpeechProvider;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Thrown when a provider or model is unknown, not allowed, or its settings are missing. */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

const OLLAMA_DEFAULT_MODEL = "llama3.1:8b";
const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";

function ollamaBaseUrl(env: Env) {
  // Ollama on the Mac. From inside DDEV the Mac is host.docker.internal (set in DDEV config).
  return env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
}

/** OpenAI models that may be used. Keeps an expensive model from being picked by accident. */
function allowedOpenAiModels(env: Env): string[] {
  const list = env.OPENAI_MODELS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list?.length ? list : [env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL];
}

const llmProviders: Record<string, (env: Env, model?: string) => LanguageModelProvider> = {
  mock: () => new MockLanguageModelProvider(),
  ollama: (env, model) =>
    new OpenAICompatibleProvider({
      name: "ollama",
      baseUrl: ollamaBaseUrl(env),
      model: model ?? env.OLLAMA_MODEL ?? OLLAMA_DEFAULT_MODEL,
      // The first request after a while loads the model into memory, which can take a minute.
      timeoutMs: 120_000,
      // "none" switches off the thinking step of reasoning models (e.g. Qwen 3): too slow for calls.
      reasoningEffort: env.OLLAMA_REASONING_EFFORT || undefined,
      // Runs on the Mac: no per-token price.
      estimateCost: () => 0,
    }),
  openai: (env, model) => {
    if (!env.OPENAI_API_KEY) {
      throw new ProviderConfigError("OPENAI_API_KEY is not set (put it in .ddev/.env.web).");
    }
    const chosen = model ?? env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL;
    if (!allowedOpenAiModels(env).includes(chosen)) {
      throw new ProviderConfigError(
        `OpenAI model "${chosen}" is not allowed. Allowed: ${allowedOpenAiModels(env).join(", ")} (OPENAI_MODELS).`,
      );
    }
    return new OpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: chosen,
      apiKey: env.OPENAI_API_KEY,
      timeoutMs: 30_000,
      estimateCost: (usage) => openAiCostUsd(chosen, usage),
    });
  },
};

const sttProviders: Record<string, (env: Env) => SpeechToTextProvider> = {
  mock: () => new MockSpeechToTextProvider(),
};

const ttsProviders: Record<string, (env: Env) => TextToSpeechProvider> = {
  mock: () => new MockTextToSpeechProvider(),
};

function factoryFor<T>(kind: string, factories: Record<string, T>, name: string): T {
  const factory = factories[name];
  if (!factory) {
    throw new ProviderConfigError(`Unknown ${kind} provider "${name}"`);
  }
  return factory;
}

/** A language model by provider name, optionally with a specific model, e.g. ollama + "qwen3:8b". */
export function createLanguageModel(
  spec: ModelSpec,
  env: Env = process.env,
): LanguageModelProvider {
  return factoryFor("llm", llmProviders, spec.provider)(env, spec.model);
}

export function createProviders(selection: ProviderSelection, env: Env = process.env): Providers {
  return {
    stt: factoryFor("stt", sttProviders, selection.stt)(env),
    llm: createLanguageModel({ provider: selection.llm }, env),
    tts: factoryFor("tts", ttsProviders, selection.tts)(env),
  };
}

/**
 * Every language model that can be picked right now: the models installed in Ollama
 * (asked live, so newly pulled models appear) and the allowed OpenAI models (if a key is set).
 */
export async function listLanguageModels(
  env: Env = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<{ models: ModelOption[]; problems: string[] }> {
  const models: ModelOption[] = [];
  const problems: string[] = [];

  // Ollama's own API lives next to its OpenAI-compatible /v1 API.
  const tagsUrl = ollamaBaseUrl(env).replace(/\/v1\/?$/, "") + "/api/tags";
  try {
    const response = await fetchFn(tagsUrl, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as {
      models?: {
        name: string;
        details?: { parameter_size?: string; quantization_level?: string };
      }[];
    };
    for (const m of body.models ?? []) {
      const details = [m.details?.parameter_size, m.details?.quantization_level].filter(Boolean);
      models.push({
        provider: "ollama",
        model: m.name,
        label: `${m.name} (local${details.length ? `, ${details.join(" ")}` : ""})`,
      });
    }
  } catch (error) {
    problems.push(
      `Ollama isn't reachable (${error instanceof Error ? error.message : String(error)}). Is it running? brew services start ollama`,
    );
  }

  if (env.OPENAI_API_KEY) {
    for (const model of allowedOpenAiModels(env)) {
      models.push({ provider: "openai", model, label: `${model} (OpenAI)` });
    }
  } else {
    problems.push("OpenAI is off: OPENAI_API_KEY is not set.");
  }
  return { models, problems };
}

import type { ProviderSelection } from "@voice-agent/shared";
import { MockLanguageModelProvider } from "./providers/llm/mock";
import { OpenAICompatibleProvider } from "./providers/llm/openai-compatible";
import type { LanguageModelProvider } from "./providers/llm/types";
import { MockSpeechToTextProvider } from "./providers/stt/mock";
import type { SpeechToTextProvider } from "./providers/stt/types";
import { MockTextToSpeechProvider } from "./providers/tts/mock";
import type { TextToSpeechProvider } from "./providers/tts/types";

// Maps provider names (from an agent config) to implementations.
// To add a vendor: implement the interface, then add one line to the matching map.
// Settings such as API keys and model names come from environment variables (see .env.example).

export interface Providers {
  stt: SpeechToTextProvider;
  llm: LanguageModelProvider;
  tts: TextToSpeechProvider;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Thrown when a provider name is unknown or its settings are missing. */
export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

const sttProviders: Record<string, (env: Env) => SpeechToTextProvider> = {
  mock: () => new MockSpeechToTextProvider(),
};

const llmProviders: Record<string, (env: Env) => LanguageModelProvider> = {
  mock: () => new MockLanguageModelProvider(),
  // Local model served by Ollama on the Mac. From inside DDEV the Mac is host.docker.internal.
  ollama: (env) =>
    new OpenAICompatibleProvider({
      name: "ollama",
      baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      model: env.OLLAMA_MODEL ?? "llama3.1:8b",
      // The first request after a while loads the model into memory, which can take a minute.
      timeoutMs: 120_000,
    }),
  openai: (env) => {
    if (!env.OPENAI_API_KEY) {
      throw new ProviderConfigError("OPENAI_API_KEY is not set (put it in .ddev/.env.web).");
    }
    return new OpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
      apiKey: env.OPENAI_API_KEY,
      timeoutMs: 30_000,
    });
  },
};

const ttsProviders: Record<string, (env: Env) => TextToSpeechProvider> = {
  mock: () => new MockTextToSpeechProvider(),
};

function pick<T>(
  kind: string,
  factories: Record<string, (env: Env) => T>,
  name: string,
  env: Env,
): T {
  const factory = factories[name];
  if (!factory) {
    throw new ProviderConfigError(`Unknown ${kind} provider "${name}"`);
  }
  return factory(env);
}

export function createLanguageModel(name: string, env: Env = process.env): LanguageModelProvider {
  return pick("llm", llmProviders, name, env);
}

export function createProviders(selection: ProviderSelection, env: Env = process.env): Providers {
  return {
    stt: pick("stt", sttProviders, selection.stt, env),
    llm: pick("llm", llmProviders, selection.llm, env),
    tts: pick("tts", ttsProviders, selection.tts, env),
  };
}

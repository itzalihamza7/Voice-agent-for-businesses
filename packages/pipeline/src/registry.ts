import type { ProviderSelection } from "@voice-agent/shared";
import { MockLanguageModelProvider } from "./providers/llm/mock";
import type { LanguageModelProvider } from "./providers/llm/types";
import { MockSpeechToTextProvider } from "./providers/stt/mock";
import type { SpeechToTextProvider } from "./providers/stt/types";
import { MockTextToSpeechProvider } from "./providers/tts/mock";
import type { TextToSpeechProvider } from "./providers/tts/types";

// Maps provider names (from an agent config) to implementations.
// To add a vendor: implement the interface, then add one line to the matching map.

export interface Providers {
  stt: SpeechToTextProvider;
  llm: LanguageModelProvider;
  tts: TextToSpeechProvider;
}

const sttProviders: Record<string, () => SpeechToTextProvider> = {
  mock: () => new MockSpeechToTextProvider(),
};

const llmProviders: Record<string, () => LanguageModelProvider> = {
  mock: () => new MockLanguageModelProvider(),
};

const ttsProviders: Record<string, () => TextToSpeechProvider> = {
  mock: () => new MockTextToSpeechProvider(),
};

function pick<T>(kind: string, factories: Record<string, () => T>, name: string): T {
  const factory = factories[name];
  if (!factory) {
    throw new Error(`Unknown ${kind} provider "${name}"`);
  }
  return factory();
}

export function createProviders(selection: ProviderSelection): Providers {
  return {
    stt: pick("stt", sttProviders, selection.stt),
    llm: pick("llm", llmProviders, selection.llm),
    tts: pick("tts", ttsProviders, selection.tts),
  };
}

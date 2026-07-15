import type { SynthesisResult, TextToSpeechProvider } from "./types";

// Fake TTS for tests and local development. Returns empty audio bytes.
export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = "mock";

  async synthesize(_text: string): Promise<SynthesisResult> {
    return { audio: new Uint8Array(0), mimeType: "audio/wav" };
  }
}

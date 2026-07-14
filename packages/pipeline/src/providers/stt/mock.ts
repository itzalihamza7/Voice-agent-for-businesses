import type { SpeechToTextProvider, TranscriptionResult } from "./types";

// Fake STT for tests and local development. Ignores the audio and returns fixed text.
export class MockSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "mock";

  async transcribe(_audio: Uint8Array): Promise<TranscriptionResult> {
    return { text: "Hello, I have a question about my order." };
  }
}

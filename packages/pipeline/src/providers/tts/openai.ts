import type { SpeechFormat, SynthesisResult, TextToSpeechProvider } from "./types";

// OpenAI text-to-speech (POST /v1/audio/speech): the agent's words in, MP3 out.

export interface OpenAITextToSpeechConfig {
  apiKey: string;
  /** e.g. "gpt-4o-mini-tts" or "tts-1". */
  model: string;
  /** e.g. "alloy", "coral", "sage". */
  voice: string;
  /** How to speak (gpt-4o-mini-tts only), e.g. "Warm and friendly receptionist". */
  instructions?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class OpenAITextToSpeech implements TextToSpeechProvider {
  readonly name = "openai";

  constructor(private readonly config: OpenAITextToSpeechConfig) {}

  async synthesize(text: string, format: SpeechFormat = "mp3"): Promise<SynthesisResult> {
    const started = performance.now();
    const response = await (this.config.fetch ?? fetch)("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        voice: this.config.voice,
        input: text,
        response_format: format,
        ...(this.config.instructions ? { instructions: this.config.instructions } : {}),
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      throw new Error(
        `openai speech: HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      // OpenAI's "pcm" is 16-bit little-endian at 24 kHz, mono.
      mimeType: format === "pcm" ? "audio/pcm;rate=24000" : "audio/mpeg",
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

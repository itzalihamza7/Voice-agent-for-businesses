import type { SpeechToTextProvider, TranscriptionResult } from "./types";

// OpenAI speech-to-text (POST /v1/audio/transcriptions). One recording in, its text out; the
// browser cuts recordings at pauses, so each is one thing the caller said.

export interface OpenAISpeechToTextConfig {
  apiKey: string;
  /** e.g. "gpt-4o-mini-transcribe" or "whisper-1". */
  model: string;
  /** Helps with names and words the model might mishear, e.g. the business's name. */
  prompt?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class OpenAISpeechToText implements SpeechToTextProvider {
  readonly name = "openai";

  constructor(private readonly config: OpenAISpeechToTextConfig) {}

  async transcribe(audio: Uint8Array, mimeType = "audio/webm"): Promise<TranscriptionResult> {
    const started = performance.now();
    const form = new FormData();
    // OpenAI recognises the format by the file name's extension.
    const subtype = mimeType.split("/")[1]?.split(";")[0] ?? "webm";
    const extension = EXTENSIONS[subtype] ?? subtype;
    // Copied into a plain ArrayBuffer: Blob only takes ArrayBuffer-backed bytes.
    const bytes = new Uint8Array(audio).buffer;
    form.append("file", new Blob([bytes], { type: mimeType }), `speech.${extension}`);
    form.append("model", this.config.model);
    form.append("language", "en");
    if (this.config.prompt) form.append("prompt", this.config.prompt);
    const response = await (this.config.fetch ?? fetch)(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      },
    );
    if (!response.ok) {
      throw new Error(
        `openai transcription: HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    const body = (await response.json()) as { text?: string };
    return { text: (body.text ?? "").trim(), latencyMs: Math.round(performance.now() - started) };
  }
}

const EXTENSIONS: Record<string, string> = {
  mpeg: "mp3",
  "x-wav": "wav",
  wave: "wav",
  "x-m4a": "m4a",
  mp4: "m4a",
};

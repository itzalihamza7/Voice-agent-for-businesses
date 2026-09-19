// Speech-to-text: turns caller audio into text.
// Real vendors (e.g. Deepgram, Whisper) will each implement this interface in their own file.
// Streaming (partial transcripts while the caller speaks) will be added here later.

export interface TranscriptionResult {
  text: string;
  /** Time the vendor took, when measured. */
  latencyMs?: number;
}

export interface SpeechToTextProvider {
  readonly name: string;
  /** mimeType tells the vendor the audio format, e.g. "audio/webm" from a browser recording. */
  transcribe(audio: Uint8Array, mimeType?: string): Promise<TranscriptionResult>;
}

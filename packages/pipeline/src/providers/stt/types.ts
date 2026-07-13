// Speech-to-text: turns caller audio into text.
// Real vendors (e.g. Deepgram, Whisper) will each implement this interface in their own file.
// Streaming (partial transcripts while the caller speaks) will be added here later.

export interface TranscriptionResult {
  text: string;
}

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(audio: Uint8Array): Promise<TranscriptionResult>;
}

// Text-to-speech: turns the agent's reply into audio to play to the caller.
// Real vendors (e.g. ElevenLabs, Cartesia) will each implement this interface in their own file.
// Voice selection and streaming audio will be added here later.

export interface SynthesisResult {
  audio: Uint8Array;
  mimeType: string;
  /** Time the vendor took, when measured. */
  latencyMs?: number;
}

export interface TextToSpeechProvider {
  readonly name: string;
  synthesize(text: string): Promise<SynthesisResult>;
}

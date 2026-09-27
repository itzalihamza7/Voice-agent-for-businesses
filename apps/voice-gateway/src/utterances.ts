import { rms } from "./audio";

// Cuts the caller's audio into utterances: speech starts one, a pause ends it. Works on the
// 20 ms frames Twilio sends, so durations are counted in frames.

export interface UtteranceOptions {
  /** Loudness (0–1) above which a frame counts as speech. */
  speechLevel: number;
  /** Speech frames needed to start an utterance (filters clicks). */
  startFrames: number;
  /** Silent frames that end it. */
  endFrames: number;
}

/** Phone defaults: quiet speech still counts, and a pause of 0.9 s ends the utterance. */
export const PHONE_UTTERANCES: UtteranceOptions = {
  speechLevel: 0.01,
  startFrames: 5,
  endFrames: 45,
};

export class UtteranceDetector {
  private frames: Int16Array[] = [];
  private loud = 0;
  private quiet = 0;
  speaking = false;

  constructor(
    private readonly options: UtteranceOptions,
    /** Called with the whole utterance when the caller pauses. */
    private readonly onUtterance: (pcm: Int16Array) => void,
    /** Called when the caller starts speaking (for barge-in). */
    private readonly onSpeechStart: () => void = () => {},
  ) {}

  push(frame: Int16Array): void {
    const isSpeech = rms(frame) > this.options.speechLevel;
    if (!this.speaking) {
      this.loud = isSpeech ? this.loud + 1 : 0;
      // Keep a little audio from before speech was detected, so the first word isn't cut.
      this.frames.push(frame);
      if (this.frames.length > this.options.startFrames + 5) this.frames.shift();
      if (this.loud >= this.options.startFrames) {
        this.speaking = true;
        this.quiet = 0;
        this.onSpeechStart();
      }
      return;
    }
    this.frames.push(frame);
    this.quiet = isSpeech ? 0 : this.quiet + 1;
    if (this.quiet >= this.options.endFrames) {
      const total = this.frames.reduce((n, f) => n + f.length, 0);
      const pcm = new Int16Array(total);
      let offset = 0;
      for (const f of this.frames) {
        pcm.set(f, offset);
        offset += f.length;
      }
      this.frames = [];
      this.speaking = false;
      this.loud = 0;
      this.onUtterance(pcm);
    }
  }
}

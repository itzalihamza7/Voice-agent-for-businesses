import { describe, expect, it } from "vitest";
import {
  bytesToPcm,
  decodeMuLawSample,
  downsample24kTo8k,
  encodeMuLawSample,
  frames,
  rms,
  wav,
} from "./audio";
import { UtteranceDetector } from "./utterances";

describe("phone audio", () => {
  it("round-trips samples through μ-law within its precision", () => {
    for (const sample of [0, 100, -100, 1000, -1000, 12000, -12000, 32000, -32000]) {
      const back = decodeMuLawSample(encodeMuLawSample(sample));
      expect(Math.abs(back - sample)).toBeLessThanOrEqual(Math.max(8, Math.abs(sample) * 0.04));
    }
    expect(encodeMuLawSample(0)).toBe(0xff);
  });

  it("downsamples 24 kHz to 8 kHz and reads little-endian PCM", () => {
    expect([...downsample24kTo8k(Int16Array.from([3, 6, 9, 30, 30, 30, 1]))]).toEqual([6, 30]);
    expect([...bytesToPcm(Uint8Array.from([0x01, 0x00, 0xff, 0xff]))]).toEqual([1, -1]);
  });

  it("writes a WAV header and splits 20 ms frames", () => {
    const file = wav(Int16Array.from([1, 2]), 8000);
    expect(new TextDecoder().decode(file.subarray(0, 4))).toBe("RIFF");
    expect(new DataView(file.buffer).getUint32(24, true)).toBe(8000);
    expect(file.length).toBe(48);
    expect(frames(new Uint8Array(400)).map((f) => f.length)).toEqual([160, 160, 80]);
  });
});

describe("UtteranceDetector", () => {
  const loud = () => Int16Array.from({ length: 160 }, (_, i) => (i % 2 ? 8000 : -8000));
  const quiet = () => new Int16Array(160);

  it("starts on speech, reports barge-in, and ends the utterance after a pause", () => {
    const utterances: number[] = [];
    let starts = 0;
    const detector = new UtteranceDetector(
      { speechLevel: 0.02, startFrames: 3, endFrames: 5 },
      (pcm) => utterances.push(pcm.length),
      () => starts++,
    );
    for (let i = 0; i < 2; i++) detector.push(loud()); // too short to count
    detector.push(quiet());
    for (let i = 0; i < 10; i++) detector.push(loud());
    for (let i = 0; i < 4; i++) detector.push(quiet());
    expect(utterances).toEqual([]);
    detector.push(quiet());
    expect(starts).toBe(1);
    expect(utterances).toHaveLength(1);
    expect(rms(loud())).toBeGreaterThan(0.2);
  });
});

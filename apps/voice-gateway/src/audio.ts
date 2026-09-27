// Phone audio. Twilio streams G.711 μ-law at 8 kHz in 20 ms frames (160 bytes). Speech-to-text
// gets WAV (16-bit PCM); text-to-speech gives 16-bit PCM at 24 kHz, which goes back to 8 kHz μ-law.

const BIAS = 0x84;
const CLIP = 32635;

/** One 16-bit PCM sample to μ-law. */
export function encodeMuLawSample(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = Math.min(Math.abs(sample), CLIP) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (magnitude & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  magnitude = ~(sign | (exponent << 4) | mantissa);
  return magnitude & 0xff;
}

/** One μ-law byte to a 16-bit PCM sample. */
export function decodeMuLawSample(byte: number): number {
  const u = ~byte & 0xff;
  const exponent = (u >> 4) & 0x07;
  const sample = ((((u & 0x0f) << 3) + BIAS) << exponent) - BIAS;
  return u & 0x80 ? -sample : sample;
}

export function muLawToPcm(mulaw: Uint8Array): Int16Array {
  return Int16Array.from(mulaw, decodeMuLawSample);
}

export function pcmToMuLaw(pcm: Int16Array): Uint8Array {
  return Uint8Array.from(pcm, encodeMuLawSample);
}

/** 24 kHz → 8 kHz: average each group of three samples (a crude low-pass, fine for voice). */
export function downsample24kTo8k(pcm: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor(pcm.length / 3));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round((pcm[i * 3]! + pcm[i * 3 + 1]! + pcm[i * 3 + 2]!) / 3);
  }
  return out;
}

/** Little-endian 16-bit PCM bytes (as text-to-speech returns them) to samples. */
export function bytesToPcm(bytes: Uint8Array): Int16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Int16Array.from({ length: Math.floor(bytes.length / 2) }, (_, i) =>
    view.getInt16(i * 2, true),
  );
}

/** A WAV file (16-bit mono) around PCM samples, for speech-to-text. */
export function wav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return bytes;
}

/** Loudness of a frame, 0–1 (root mean square). */
export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (const sample of pcm) sum += (sample / 32768) ** 2;
  return Math.sqrt(sum / pcm.length);
}

/** 160-byte frames (20 ms at 8 kHz), the size Twilio sends and expects. */
export function frames(mulaw: Uint8Array, size = 160): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < mulaw.length; i += size) out.push(mulaw.subarray(i, i + size));
  return out;
}

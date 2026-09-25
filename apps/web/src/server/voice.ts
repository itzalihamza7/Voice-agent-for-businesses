import type { ConversationDeps } from "@voice-agent/orchestrator";
import { createSpeechToText, createTextToSpeech, type SpeechFormat } from "@voice-agent/pipeline";
import { spokenLines, type TurnResult } from "@voice-agent/shared";
import { getCallSessions } from "./calls";

// One voice turn: what the caller said (audio) → text → the call's next turn → the agent's reply
// as speech. Used by the browser's voice mode and by phone calls (through the voice gateway).

export interface VoiceTurn {
  heard: string;
  result: TurnResult | null;
  audio: Uint8Array | null;
  mimeType: string | null;
  timings: { sttMs: number; agentMs?: number; ttsMs?: number; totalMs?: number };
}

export async function voiceTurn(
  callId: string,
  audio: Uint8Array,
  audioType: string,
  deps: ConversationDeps,
  format: SpeechFormat = "mp3",
): Promise<VoiceTurn> {
  const started = performance.now();
  const heard = await createSpeechToText().transcribe(audio, audioType);
  const sttMs = Math.round(performance.now() - started);
  if (!heard.text)
    return { heard: "", result: null, audio: null, mimeType: null, timings: { sttMs } };

  const agentStarted = performance.now();
  const result = await (
    await getCallSessions()
  ).send(callId, { type: "reply", text: heard.text }, deps);
  const agentMs = Math.round(performance.now() - agentStarted);

  const ttsStarted = performance.now();
  const speech = await speakEvents(result, format);
  const ttsMs = Math.round(performance.now() - ttsStarted);
  return {
    heard: heard.text,
    result,
    audio: speech?.audio ?? null,
    mimeType: speech?.mimeType ?? null,
    timings: { sttMs, agentMs, ttsMs, totalMs: Math.round(performance.now() - started) },
  };
}

/** Everything the agent says in a turn, as one piece of speech (null if it said nothing). */
export async function speakEvents(result: TurnResult, format: SpeechFormat = "mp3") {
  const lines = spokenLines(result.events);
  return lines.length ? createTextToSpeech().synthesize(lines.join(" "), format) : null;
}

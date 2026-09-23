"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Hands-free voice for the test chat. The microphone is watched with an audio level meter
// (simple voice activity detection): speech starts a recording, a pause ends it, and each
// recording is one thing the caller said. Speaking while the agent talks stops the agent's
// audio (barge-in), like interrupting someone on the phone.

/** Level (0–1 RMS) above which the microphone counts as speech. */
const SPEECH_LEVEL = 0.03;
/** Speech must last this long to start a recording (ignores clicks and taps). */
const START_MS = 150;
/** Silence this long ends the utterance. */
const PAUSE_MS = 900;

export type VoiceStatus = "off" | "listening" | "recording" | "thinking" | "speaking";

/** onUtterance gets each recording and returns the agent's spoken reply (or null) to play. */
export function useVoice(onUtterance: (audio: Blob) => Promise<Blob | null>) {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [level, setLevel] = useState(0);
  const parts = useRef<{
    stream: MediaStream;
    context: AudioContext;
    frame: number;
    recorder: MediaRecorder | null;
  } | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const busy = useRef(false);
  const handler = useRef(onUtterance);
  useEffect(() => {
    handler.current = onUtterance;
  }, [onUtterance]);

  const stop = useCallback(() => {
    const current = parts.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    current.recorder?.stop();
    current.stream.getTracks().forEach((track) => track.stop());
    void current.context.close();
    parts.current = null;
    player.current?.pause();
    setStatus("off");
    setLevel(0);
  }, []);

  /** Plays the agent's reply; the caller can talk over it. */
  const play = useCallback(async (audio: Blob) => {
    player.current?.pause();
    const element = new Audio(URL.createObjectURL(audio));
    player.current = element;
    setStatus("speaking");
    await element.play().catch(() => undefined);
    await new Promise<void>((resolve) => {
      element.onended = () => resolve();
      element.onpause = () => resolve();
    });
    if (parts.current) setStatus("listening");
  }, []);

  const start = useCallback(async () => {
    if (parts.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let loudSince = 0;
    let quietSince = 0;
    parts.current = { stream, context, frame: 0, recorder: null };
    setStatus("listening");

    const tick = () => {
      const current = parts.current;
      if (!current) return;
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      setLevel(rms);
      const now = performance.now();
      const speaking = rms > SPEECH_LEVEL;

      if (!current.recorder && speaking && !busy.current) {
        loudSince ||= now;
        if (now - loudSince > START_MS) {
          // Barge-in: the caller talks over the agent.
          if (player.current && !player.current.paused) player.current.pause();
          const recorder = new MediaRecorder(stream);
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = async () => {
            const audio = new Blob(chunks, { type: recorder.mimeType });
            busy.current = true;
            setStatus("thinking");
            try {
              const reply = await handler.current(audio);
              if (reply) await play(reply);
            } finally {
              busy.current = false;
              if (parts.current && player.current?.paused !== false) setStatus("listening");
            }
          };
          recorder.start();
          current.recorder = recorder;
          quietSince = 0;
          setStatus("recording");
        }
      } else if (!speaking) {
        loudSince = 0;
      }

      if (current.recorder) {
        if (speaking) quietSince = 0;
        else {
          quietSince ||= now;
          if (now - quietSince > PAUSE_MS) {
            current.recorder.stop();
            current.recorder = null;
          }
        }
      }
      current.frame = requestAnimationFrame(tick);
    };
    parts.current.frame = requestAnimationFrame(tick);
  }, [play]);

  useEffect(() => stop, [stop]);
  return { status, level, start, stop, play };
}

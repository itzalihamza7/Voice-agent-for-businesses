// Types for phone calls, shown in the monitoring dashboard (call logs,
// transcripts, sentiment). Fields will grow when call recording is built.

export type Sentiment = "positive" | "neutral" | "negative";

export interface TranscriptTurn {
  speaker: "caller" | "agent";
  text: string;
  // Milliseconds since the call started.
  atMs: number;
}

export interface CallLog {
  callId: string;
  agentId: string;
  // Which agent config version handled this call (needed for A/B comparisons).
  agentVersion: number;
  startedAt: string;
  endedAt: string | null;
  transcript: TranscriptTurn[];
  sentiment: Sentiment | null;
}

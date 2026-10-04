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

/** Where a call came from and which agent version handled it. */
export interface CallMeta {
  source: "test" | "phone";
  agentId?: string;
  agentVersion?: number;
  callerPhone?: string;
  /** Epoch milliseconds when the call started. */
  startedAt: number;
}

/** One event of a call and when it happened (milliseconds since the start). */
export interface TraceEntry {
  atMs: number;
  event: import("./conversation").ConversationEvent;
}

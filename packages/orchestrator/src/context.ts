import { estimateTokens, type CallSummary, type TranscriptEntry } from "@voice-agent/shared";

// What an AI request sees of the call: the rolling summary (if any) plus the recent
// transcript, kept within a token budget. Local models run with a small context window
// (Ollama: 4,096 tokens for prompt and answer) and cut a prompt that doesn't fit without an
// error: in testing, a ~6,000-token prompt was cut to its last ~2,048 tokens, system prompt
// (the agent's instructions) first. So the engine decides what goes, in this order:
//   1. Knowledge base results and tool results from earlier steps are shortened to their
//      first line (at most 200 characters): the agent has already used them, and they are
//      the biggest entries.
//   2. The oldest messages are left out. The rolling summary (summary.ts) keeps their gist;
//      without one they are simply gone.
// Branch decisions get less on purpose: see decisionContext.
// Never cut: the system prompt, the summary and the last few messages.

/**
 * Tokens the conversation part of a prompt (summary + transcript) may use. With the system
 * prompt (~550 tokens) and the answer this stays inside Ollama's 4,096-token window.
 */
export const DEFAULT_CONTEXT_BUDGET = 2500;
/** The most recent messages are always sent in full. */
const KEEP_RECENT = 4;
/** How much of an earlier note is kept when it is shortened. */
const MAX_SHORT_NOTE = 200;

export interface CallContext {
  /** The rolling summary of the earlier part of the call, or null. */
  summary: string | null;
  /** The messages after the summary, possibly shortened. */
  entries: TranscriptEntry[];
  /** What had to be cut to stay within the budget. */
  cuts: ContextCuts;
}

export interface ContextCuts {
  /** Estimated tokens before and after cutting. */
  tokensBefore: number;
  tokensAfter: number;
  notesShortened: number;
  messagesDropped: number;
}

export function buildContext(
  transcript: TranscriptEntry[],
  summary: CallSummary | null,
  budget: number,
): CallContext {
  const entries = transcript.slice(summary?.upTo ?? 0);
  const summaryTokens = summary ? estimateTokens(summary.text) : 0;
  const size = () => summaryTokens + entries.reduce((sum, e) => sum + estimateTokens(e.text), 0);
  const tokensBefore = size();
  let notesShortened = 0;
  let messagesDropped = 0;

  // 1. Shorten earlier notes, oldest first.
  const protectedFrom = Math.max(0, entries.length - KEEP_RECENT);
  for (let i = 0; i < protectedFrom && size() > budget; i++) {
    const entry = entries[i]!;
    if (entry.role !== "system") continue;
    const short = shortenNote(entry.text);
    if (short !== entry.text) {
      entries[i] = { ...entry, text: short };
      notesShortened++;
    }
  }
  // 2. Leave out the oldest messages.
  while (entries.length > KEEP_RECENT && size() > budget) {
    entries.shift();
    messagesDropped++;
  }

  return {
    summary: summary?.text ?? null,
    entries,
    cuts: { tokensBefore, tokensAfter: size(), notesShortened, messagesDropped },
  };
}

/** Spoken messages a Branch decision sees (plus the summary). */
const DECISION_MESSAGES = 4;

/**
 * What a Branch decision sees: the summary and the last few spoken messages, without notes.
 * A decision is about what the caller just said; the whole call distracts small models. In
 * testing (demo agent, fifth question of a call), gpt-4.1-nano picked the right path 0–3 times
 * out of 10 with the whole call and 10 out of 10 with the last four spoken messages. A tool
 * result the decision depends on is passed separately (see branchDecisionPrompt).
 */
export function decisionContext(
  transcript: TranscriptEntry[],
  summary: CallSummary | null,
): CallContext {
  const after = transcript.slice(summary?.upTo ?? 0);
  const spoken = after.filter((entry) => entry.role !== "system");
  const entries = spoken.slice(-DECISION_MESSAGES);
  const tokens = (list: TranscriptEntry[]) =>
    list.reduce((sum, entry) => sum + estimateTokens(entry.text), 0);
  const summaryTokens = summary ? estimateTokens(summary.text) : 0;
  return {
    summary: summary?.text ?? null,
    entries,
    cuts: {
      tokensBefore: summaryTokens + tokens(after),
      tokensAfter: summaryTokens + tokens(entries),
      notesShortened: 0,
      // Notes aren't counted: they are left out of every decision on purpose.
      messagesDropped: spoken.length - entries.length,
    },
  };
}

/** Knowledge notes keep their first line (what was searched); tool results their start. */
function shortenNote(text: string): string {
  const firstLine = text.split("\n")[0]!;
  const short = firstLine.length > MAX_SHORT_NOTE ? firstLine.slice(0, MAX_SHORT_NOTE) : firstLine;
  return short === text ? text : `${short} … (details left out to save space)`;
}

/** The conversation as one text for a prompt: the summary first, then the recent messages. */
export function formatContext(context: CallContext): string {
  const speaker = { agent: "Agent", caller: "Caller", system: "Note" } as const;
  const lines = context.entries.map((entry) => `${speaker[entry.role]}: ${entry.text}`);
  if (context.summary) {
    const gap = context.cuts.messagesDropped ? ["(Some messages after that are left out.)"] : [];
    return [`Summary of the call so far: ${context.summary}`, "", ...gap, ...lines].join("\n");
  }
  if (lines.length === 0) return "(The call has just started.)";
  return context.cuts.messagesDropped
    ? ["(The start of the call is left out.)", ...lines].join("\n")
    : lines.join("\n");
}

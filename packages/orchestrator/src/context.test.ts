import type { TranscriptEntry } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { buildContext, decisionContext, formatContext } from "./context";

const caller = (text: string): TranscriptEntry => ({ role: "caller", text });
const agent = (text: string): TranscriptEntry => ({ role: "agent", text });
const note = (text: string): TranscriptEntry => ({ role: "system", text });
// ~100 tokens of filler (4 characters per token).
const long = (label: string) => `${label}\n${"x".repeat(400)}`;

describe("buildContext", () => {
  const transcript = [
    caller("How much is a haircut?"),
    note(long("Knowledge base results for haircut price:")),
    agent("It's thirty pounds."),
    caller("And parking?"),
    note(long("Knowledge base results for parking:")),
    agent("Free parking behind the salon."),
    caller("Thanks!"),
  ];

  it("sends everything when it fits", () => {
    const context = buildContext(transcript, null, 10_000);
    expect(context.entries).toEqual(transcript);
    expect(context.cuts.notesShortened + context.cuts.messagesDropped).toBe(0);
  });

  it("shortens earlier notes first, never the last four messages", () => {
    const context = buildContext(transcript, null, 200);
    expect(context.entries[1]!.text).toBe(
      "Knowledge base results for haircut price: … (details left out to save space)",
    );
    // The parking note is one of the last four messages: kept in full.
    expect(context.entries[4]!.text).toBe(transcript[4]!.text);
    expect(context.cuts).toMatchObject({ notesShortened: 1, messagesDropped: 0 });
    expect(context.cuts.tokensAfter).toBeLessThan(context.cuts.tokensBefore);
  });

  it("then leaves out the oldest messages, keeping the last four", () => {
    const context = buildContext(transcript, null, 10);
    expect(context.entries).toHaveLength(4);
    expect(context.entries[0]).toEqual(caller("And parking?"));
    expect(context.cuts.messagesDropped).toBe(3);
    expect(formatContext(context)).toMatch(
      /^\(The start of the call is left out\.\)\nCaller: And parking\?/,
    );
  });

  it("sends the summary instead of the messages it covers", () => {
    const context = buildContext(
      transcript,
      { text: "Caller asked the price: £30.", upTo: 3 },
      10_000,
    );
    expect(context.entries[0]).toEqual(caller("And parking?"));
    expect(formatContext(context)).toMatch(
      /^Summary of the call so far: Caller asked the price: £30\.\n\nCaller: And parking\?/,
    );
  });

  it("shortens one-line tool results to their start", () => {
    const toolNote = note(`The tool "checkAvailability" returned: ${"y".repeat(800)}`);
    const context = buildContext([toolNote, ...transcript.slice(2)], null, 250);
    expect(context.entries[0]!.text.length).toBeLessThan(260);
  });
});

describe("decisionContext", () => {
  it("keeps the summary and the last four spoken messages, without notes", () => {
    const transcript = [
      agent("Hello!"),
      caller("Price of a haircut?"),
      note(long("Knowledge base results:")),
      agent("Thirty pounds. Anything else?"),
      caller("Parking?"),
      note(long("Knowledge base results:")),
      agent("Free parking. Anything else?"),
      caller("No thanks, bye."),
    ];
    const context = decisionContext(transcript, { text: "Caller called.", upTo: 1 });
    expect(context.summary).toBe("Caller called.");
    expect(context.entries.map((e) => e.text)).toEqual([
      "Thirty pounds. Anything else?",
      "Parking?",
      "Free parking. Anything else?",
      "No thanks, bye.",
    ]);
  });
});

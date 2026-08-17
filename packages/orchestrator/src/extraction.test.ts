import type { ChatMessage, CompletionOptions, LanguageModelProvider } from "@voice-agent/pipeline";
import { describe, expect, it } from "vitest";
import {
  extractAnswer,
  normalizePhone,
  resolveDate,
  resolveTime,
  spokenDigits,
} from "./extraction";

// Sunday, October 18, 2026
const now = new Date(2026, 9, 18, 10, 0);
const base = { now, question: "When would you like to come in?" };

/** A fake model that returns JSON answers from a script and records the requests. */
function jsonLlm(answers: unknown[]) {
  const calls: { messages: ChatMessage[]; options?: CompletionOptions }[] = [];
  const llm: LanguageModelProvider = {
    name: "fake",
    model: "fake-1",
    async complete(messages, options) {
      calls.push({ messages: [...messages], options });
      const answer = answers.shift();
      return {
        text: typeof answer === "string" ? answer : JSON.stringify(answer),
        model: "fake-1",
        latencyMs: 1,
        usage: null,
        costUsd: 0,
      };
    },
  };
  return { llm, calls };
}

describe("extractAnswer: rules", () => {
  it("handles phone, email, number and yes/no without any model", async () => {
    const run = (type: Parameters<typeof extractAnswer>[0], text: string) =>
      extractAnswer(type, text, { ...base, llm: null });
    expect(await run("phone", "+92 300-123 4567")).toMatchObject({
      ok: true,
      value: "+923001234567",
      by: "rules",
    });
    expect(await run("email", "it's Ali@Example.com.")).toMatchObject({
      value: "ali@example.com",
      by: "rules",
    });
    expect(await run("number", "3")).toMatchObject({ value: "3", by: "rules" });
    expect(await run("yesNo", "Yeah, go ahead")).toMatchObject({ value: "yes" });
    expect(await run("yesNo", "Nope")).toMatchObject({ value: "no" });
  });

  it("keeps free text as said, and without a model keeps names, dates and times as said", async () => {
    expect(await extractAnswer("text", "  anything ", { ...base, llm: null })).toEqual({
      ok: true,
      value: "anything",
      by: "text",
    });
    expect(await extractAnswer("date", "next Friday", { ...base, llm: null })).toMatchObject({
      value: "next Friday",
      by: "text",
    });
  });

  it("fails without a model when the rules can't read the answer", async () => {
    expect(await extractAnswer("phone", "my usual number", { ...base, llm: null })).toMatchObject({
      ok: false,
    });
  });
});

describe("extractAnswer: language model", () => {
  it("asks for structured output and computes the date in code", async () => {
    const { llm, calls } = jsonLlm([
      {
        found: true,
        kind: "weekday",
        weekday: "friday",
        daysFromToday: null,
        dayOfMonth: null,
        month: null,
      },
    ]);
    const result = await extractAnswer("date", "next Friday please", { ...base, llm });
    expect(result).toMatchObject({
      ok: true,
      value: "2026-10-23",
      spoken: "Friday, October 23",
      by: "ai",
    });
    expect(calls[0]!.options?.jsonSchema?.name).toBe("date_extraction");
    expect(calls[0]!.messages[0]!.content).toContain("Don't calculate dates");
  });

  it("retries once with the error when the JSON doesn't pass the checks", async () => {
    const { llm, calls } = jsonLlm([
      { found: true, phoneNumber: "call me maybe" },
      { found: true, phoneNumber: "03001234567" },
    ]);
    const result = await extractAnswer("phone", "my mobile, the one I gave you last time", {
      ...base,
      llm,
    });
    expect(result).toMatchObject({ ok: true, value: "03001234567", by: "ai" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.messages.at(-1)!.content).toContain(
      "That isn't valid: a phone number has 7 to 15 digits",
    );
  });

  it("gives up after the retry, and reports when nothing was found", async () => {
    const bad = jsonLlm([
      { found: true, email: "nope" },
      { found: true, email: "still nope" },
    ]);
    expect(await extractAnswer("email", "ali at gmail", { ...base, llm: bad.llm })).toMatchObject({
      ok: false,
    });

    const missing = jsonLlm([{ found: false, fullName: null }]);
    expect(
      await extractAnswer("name", "I'd rather not say", { ...base, llm: missing.llm }),
    ).toMatchObject({
      ok: false,
      reason: "No name in the answer.",
    });
    expect(missing.calls).toHaveLength(1);
  });

  it("ignores an am/pm the caller never said", async () => {
    const { llm } = jsonLlm([{ found: true, hour: 3, minute: 30, period: "am" }]);
    expect(await extractAnswer("time", "half past three", { ...base, llm })).toMatchObject({
      value: "15:30",
    });
    const morning = jsonLlm([{ found: true, hour: 9, minute: 0, period: "pm" }]);
    expect(
      await extractAnswer("time", "nine in the evening", { ...base, llm: morning.llm }),
    ).toMatchObject({ value: "21:00" });
  });

  it("uses the rules first and only calls the model when they can't tell", async () => {
    const { llm, calls } = jsonLlm([]);
    expect(await extractAnswer("phone", "0300 1234567", { ...base, llm })).toMatchObject({
      by: "rules",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("date and time maths", () => {
  it("resolves weekdays, offsets, days of the month and exact dates", () => {
    const iso = (data: Record<string, unknown>) => resolveDate(data, now)?.toDateString();
    expect(iso({ kind: "weekday", weekday: "friday" })).toBe("Fri Oct 23 2026");
    expect(iso({ kind: "weekday", weekday: "sunday" })).toBe("Sun Oct 25 2026"); // said on a Sunday
    expect(iso({ kind: "daysFromToday", daysFromToday: 1 })).toBe("Mon Oct 19 2026");
    expect(iso({ kind: "dayOfMonth", dayOfMonth: 30 })).toBe("Fri Oct 30 2026");
    expect(iso({ kind: "dayOfMonth", dayOfMonth: 5 })).toBe("Thu Nov 05 2026"); // already past
    expect(iso({ kind: "exactDate", month: 1, dayOfMonth: 4 })).toBe("Mon Jan 04 2027"); // next year
    expect(iso({ kind: "exactDate", month: 2, dayOfMonth: 30 })).toBeUndefined(); // impossible
  });

  it("turns hour, minute and am/pm into 24-hour time", () => {
    expect(resolveTime({ hour: 3, minute: 30, period: "none" })).toEqual({
      value: "15:30",
      spoken: "3:30 pm",
    });
    expect(resolveTime({ hour: 9, minute: 0, period: "none" })).toEqual({
      value: "09:00",
      spoken: "9 am",
    });
    expect(resolveTime({ hour: 12, minute: 0, period: "am" })).toEqual({
      value: "00:00",
      spoken: "12 am",
    });
    expect(resolveTime({ hour: 25, minute: 0, period: "none" })).toBeNull();
  });

  it("normalises phone numbers", () => {
    expect(normalizePhone("(030) 0123-4567")).toBe("03001234567");
    expect(normalizePhone("123")).toBeNull();
  });

  it("turns spoken digits into digits", () => {
    expect(spokenDigits("it's oh three hundred, one two three, four five six seven")).toBe(
      "03001234567",
    );
    expect(spokenDigits("plus nine two, double three, five")).toBe("+92335");
    expect(spokenDigits("call my office")).toBeNull();
  });
});

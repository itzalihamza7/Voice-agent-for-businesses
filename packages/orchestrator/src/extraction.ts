import { llmCallInfo, type ChatMessage, type LanguageModelProvider } from "@voice-agent/pipeline";
import type { AnswerType, LlmCallInfo } from "@voice-agent/shared";
import { z } from "zod";

// Turns what the caller said into a clean value for an Ask step, e.g. "next Friday" → 2026-10-23.
//
// The principle: the AI *understands*, our code *calculates and checks*.
//   1. Plain rules first (phone, email, number, yes/no): free, instant, predictable.
//   2. Otherwise the language model returns a small JSON structure (structured output).
//      For dates it only classifies what was said ("weekday: friday"); code computes the date.
//      In testing, small local models got 1 of 4 dates right when calculating themselves, and
//      6 of 6 when only classifying.
//   3. Every value is validated in code. If the model's JSON doesn't pass, it gets one retry
//      with the error message. If it still fails, the caller is asked again.

export type Extraction =
  | {
      ok: true;
      value: string;
      /** Easy-to-say version for dates and times, e.g. "Friday, October 23". */
      spoken?: string;
      /** "rules" = plain code, "ai" = language model, "text" = taken as said. */
      by: "text" | "rules" | "ai";
      llm?: LlmCallInfo;
    }
  | { ok: false; reason: string; llm?: LlmCallInfo };

interface Options {
  /** The model that understands answers. null = rules only. */
  llm: LanguageModelProvider | null;
  now: Date;
  /** The question that was asked, for context. */
  question: string;
}

export async function extractAnswer(
  type: AnswerType,
  answer: string,
  options: Options,
): Promise<Extraction> {
  const text = answer.trim();
  if (type === "text") return { ok: true, value: text, by: "text" };

  const ruled = byRules(type, text);
  if (ruled !== null) return { ok: true, ...ruled, by: "rules" };

  if (!options.llm) {
    // Names, dates and times need understanding: without a model, keep them as said.
    if (type === "name" || type === "date" || type === "time") {
      return { ok: true, value: text, by: "text" };
    }
    return { ok: false, reason: `That doesn't look like ${DESCRIPTIONS[type]}.` };
  }
  return byModel(type, text, { ...options, llm: options.llm });
}

// ---------------------------------------------------------------------------------------------
// 1. Plain rules

const YES = new Set([
  "yes",
  "yeah",
  "yep",
  "yup",
  "sure",
  "correct",
  "right",
  "ok",
  "okay",
  "absolutely",
]);
const NO = new Set(["no", "nope", "nah", "not", "never"]);
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

function byRules(type: AnswerType, text: string): { value: string; spoken?: string } | null {
  switch (type) {
    case "phone": {
      const phone = normalizePhone(text) ?? normalizePhone(spokenDigits(text) ?? "");
      return phone ? { value: phone } : null;
    }
    case "email": {
      const match = EMAIL.exec(text);
      return match ? { value: match[0].toLowerCase().replace(/[.,!?]+$/, "") } : null;
    }
    case "number":
      return /^-?\d+(\.\d+)?$/.test(text.replace(/,/g, ""))
        ? { value: text.replace(/,/g, "") }
        : null;
    case "yesNo": {
      const first = text.toLowerCase().match(/[a-z]+/)?.[0] ?? "";
      if (YES.has(first)) return { value: "yes" };
      if (NO.has(first)) return { value: "no" };
      return null;
    }
    default:
      return null;
  }
}

const DIGIT_WORDS: Record<string, string> = {
  oh: "0",
  o: "0",
  zero: "0",
  nought: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};
// Words people say around a phone number that carry no digits.
const FILLER = new Set([
  "it's",
  "its",
  "it",
  "is",
  "my",
  "number",
  "the",
  "um",
  "uh",
  "er",
  "and",
  "so",
  "phone",
  "mobile",
  "cell",
  "yes",
  "yeah",
  "sure",
  "ok",
  "okay",
  "that's",
  "thats",
]);

/**
 * Spoken digits to digits: "oh three hundred, one two three" → "0300123".
 * "double five" = 55, "triple" = three times, "hundred" = 00, "plus" = + at the start.
 * Null if any word isn't a digit word or filler (then the language model gets a go).
 */
export function spokenDigits(text: string): string | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let out = "";
  let repeat = 1;
  for (const word of words) {
    if (FILLER.has(word)) continue;
    if (word === "plus" && out === "") out = "+";
    else if (word === "double") repeat = 2;
    else if (word === "triple") repeat = 3;
    else if (word === "hundred") out += "00";
    else if (word === "thousand") out += "000";
    else if (/^\d+$/.test(word)) out += word.repeat(repeat);
    else if (DIGIT_WORDS[word]) {
      out += DIGIT_WORDS[word].repeat(repeat);
      repeat = 1;
      continue;
    } else return null;
    if (word !== "double" && word !== "triple") repeat = 1;
  }
  return /\d/.test(out) ? out : null;
}

/** "+92 300-123 4567" → "+923001234567". Null unless 7–15 digits with nothing else but separators. */
export function normalizePhone(text: string): string | null {
  const compact = text.replace(/[\s\-().]/g, "");
  return /^\+?\d{7,15}$/.test(compact) ? compact : null;
}

// ---------------------------------------------------------------------------------------------
// 2. Language model with structured output, 3. validation in code

const DESCRIPTIONS: Record<AnswerType, string> = {
  text: "an answer",
  name: "a name",
  phone: "a phone number",
  email: "an email address",
  date: "a date",
  time: "a time",
  number: "a number",
  yesNo: "a yes or no",
};

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({
  type: [type, "null"],
  ...extra,
});

/** What the model must return for each type: JSON Schema (sent to the model) + checks in code. */
const SPECS: Record<
  Exclude<AnswerType, "text">,
  {
    guidance: string;
    properties: Record<string, unknown>;
    toValue: (
      data: Record<string, unknown>,
      now: Date,
      // The caller's own words, to check the model's claims against.
      said: string,
    ) => { value: string; spoken?: string } | string;
  }
> = {
  name: {
    guidance: "Give the person's name as they said it, properly capitalised.",
    properties: { fullName: nullable("string") },
    toValue: (data) => {
      const name = String(data.fullName ?? "")
        .trim()
        .replace(/\s+/g, " ");
      return /\p{L}/u.test(name) && name.length <= 80
        ? { value: name }
        : "the name is empty or too long";
    },
  },
  phone: {
    guidance: [
      "Write the phone number with digits only. Turn spoken digits into digits: 'oh' and 'zero' = 0,",
      "'double five' = 55, 'hundred' = two zeros (e.g. 'three hundred' = 300).",
      "Keep every digit the caller said, in order. Only start with + if the caller said a country",
      "code (e.g. 'plus ninety two'); never add one yourself.",
    ].join(" "),
    properties: { phoneNumber: nullable("string") },
    toValue: (data) => {
      const phone = normalizePhone(String(data.phoneNumber ?? ""));
      return phone ? { value: phone } : "a phone number has 7 to 15 digits";
    },
  },
  email: {
    guidance:
      "Write the email address in normal form: 'at' = @, 'dot' = . (also inside the name), e.g. 'john dot smith at example dot com' → john.smith@example.com.",
    properties: { email: nullable("string") },
    toValue: (data) => {
      const email = String(data.email ?? "")
        .trim()
        .toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)
        ? { value: email }
        : "that is not a valid email address";
    },
  },
  number: {
    guidance: "Write the number as digits, e.g. 'three' → 3.",
    properties: { value: nullable("number") },
    toValue: (data) =>
      typeof data.value === "number" && Number.isFinite(data.value)
        ? { value: String(data.value) }
        : "value must be a number",
  },
  yesNo: {
    guidance:
      "Decide whether the caller means yes or no. Agreement such as 'that works', 'sounds good', 'go ahead' or 'perfect' means yes; refusal such as 'I'd rather not' or 'that doesn't work' means no.",
    properties: { answer: nullable("string", { enum: ["yes", "no", null] }) },
    toValue: (data) =>
      data.answer === "yes" || data.answer === "no"
        ? { value: data.answer }
        : "answer must be yes or no",
  },
  date: {
    guidance: [
      "Don't calculate dates: only say how the caller described the date.",
      "- 'Friday' or 'next Friday' → kind weekday, weekday friday",
      "- 'today' → daysFromToday 0, 'tomorrow' → daysFromToday 1, 'in three days' → daysFromToday 3",
      "- 'the 30th' → kind dayOfMonth, dayOfMonth 30",
      "- only when month and day are both said → kind exactDate with month and day",
    ].join("\n"),
    properties: {
      kind: { type: "string", enum: ["weekday", "daysFromToday", "dayOfMonth", "exactDate"] },
      weekday: nullable("string", { enum: [...WEEKDAYS(), null] }),
      daysFromToday: nullable("integer"),
      dayOfMonth: nullable("integer"),
      month: nullable("integer", { description: "1 = January" }),
    },
    toValue: (data, now) => {
      const date = resolveDate(data, now);
      return date
        ? { value: isoDate(date), spoken: spokenDate(date) }
        : "the date is incomplete or impossible";
    },
  },
  time: {
    guidance:
      "Give the hour (1-12 or 0-23) and the minute, e.g. 'half past three' → hour 3, minute 30. Set period to am or pm only if the caller says am/pm, morning, afternoon or evening; otherwise none.",
    properties: {
      hour: { type: "integer" },
      minute: { type: "integer" },
      period: { type: "string", enum: ["am", "pm", "none"] },
    },
    toValue: (data, _now, said) => {
      // "Noon" and "midnight" are exact: code sets them, whatever the model says. (qwen3:8b
      // turned "12 noon" into 00:00 by claiming "am".)
      if (/\bnoon\b/i.test(said)) return { value: "12:00", spoken: "12 noon" };
      if (/\bmidnight\b/i.test(said)) return { value: "00:00", spoken: "midnight" };
      // Small models sometimes claim "am" or "pm" that the caller never said: only trust it
      // when the caller's words support it.
      const saidPeriod = /\b(a\.?m\.?|p\.?m\.?|morning|afternoon|evening|night)\b/i.test(said);
      const time = resolveTime(saidPeriod ? data : { ...data, period: "none" });
      return time ?? "hour must be 0-23 and minute 0-59";
    },
  },
};

async function byModel(
  type: Exclude<AnswerType, "text">,
  text: string,
  { llm, now, question }: Options & { llm: LanguageModelProvider },
): Promise<Extraction> {
  const spec = SPECS[type];
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["found", ...Object.keys(spec.properties)],
    properties: { found: { type: "boolean" }, ...spec.properties },
  };
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `Extract ${DESCRIPTIONS[type]} from the caller's answer on a phone call.`,
        `Today is ${spokenDate(now)}, ${now.getFullYear()}.`,
        spec.guidance,
        "If the answer doesn't contain it, set found to false and the other fields to null.",
      ].join("\n"),
    },
    { role: "user", content: `Question: ${question}\nCaller's answer: ${text}` },
  ];

  let lastInfo: LlmCallInfo | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await llm.complete(messages, {
      temperature: 0,
      jsonSchema: { name: `${type}_extraction`, schema },
    });
    lastInfo = llmCallInfo(result);
    const parsed = z.record(z.string(), z.unknown()).safeParse(safeJson(result.text));
    let problem: string;
    if (!parsed.success) {
      problem = "the reply was not a JSON object";
    } else if (parsed.data.found !== true) {
      return {
        ok: false,
        reason: `No ${DESCRIPTIONS[type].replace(/^an? /, "")} in the answer.`,
        llm: lastInfo,
      };
    } else {
      const checked = spec.toValue(parsed.data, now, text);
      if (typeof checked !== "string") return { ok: true, ...checked, by: "ai", llm: lastInfo };
      problem = checked;
    }
    // One retry, telling the model what was wrong.
    messages.push(
      { role: "assistant", content: result.text },
      { role: "user", content: `That isn't valid: ${problem}. Answer again with corrected JSON.` },
    );
  }
  return {
    ok: false,
    reason: `Couldn't understand ${DESCRIPTIONS[type]}.`,
    ...(lastInfo ? { llm: lastInfo } : {}),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Date and time maths (done in code, not by the model)

function WEEKDAYS() {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
}

/** Calendar date (no time of day) in local time, from the model's description. */
export function resolveDate(data: Record<string, unknown>, now: Date): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (days: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const int = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) ? value : null;

  switch (data.kind) {
    case "daysFromToday": {
      const days = int(data.daysFromToday);
      return days !== null && days >= 0 && days <= 366 ? addDays(days) : null;
    }
    case "weekday": {
      const index = WEEKDAYS().indexOf(String(data.weekday));
      if (index < 0) return null;
      // The next one after today ("Friday" said on a Friday means a week later).
      return addDays((index - today.getDay() + 7) % 7 || 7);
    }
    case "dayOfMonth": {
      const day = int(data.dayOfMonth);
      if (day === null || day < 1 || day > 31) return null;
      // This month if still ahead, otherwise next month.
      for (const monthOffset of [0, 1]) {
        const date: Date = new Date(today.getFullYear(), today.getMonth() + monthOffset, day);
        if (date.getDate() === day && date >= today) return date;
      }
      return null;
    }
    case "exactDate": {
      const day = int(data.dayOfMonth);
      const month = int(data.month);
      if (day === null || month === null || month < 1 || month > 12) return null;
      // This year if still ahead, otherwise next year.
      for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
        const date: Date = new Date(year, month - 1, day);
        if (date.getMonth() === month - 1 && date >= today) return date;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * 24-hour "HH:MM" from hour, minute and am/pm. Without am/pm, 1–7 o'clock is taken as
 * afternoon (business hours: "at three" means 15:00, not 03:00).
 */
export function resolveTime(
  data: Record<string, unknown>,
): { value: string; spoken: string } | null {
  const { hour, minute, period } = data;
  if (typeof hour !== "number" || typeof minute !== "number") return null;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59)
    return null;
  let h = hour;
  if (period === "am" || period === "pm") {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (period === "pm" ? 12 : 0);
  } else {
    if (h < 0 || h > 23) return null;
    if (h >= 1 && h <= 7) h += 12;
  }
  const value = `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const spokenHour = h % 12 || 12;
  const spoken = `${spokenHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
  return { value, spoken };
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function spokenDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

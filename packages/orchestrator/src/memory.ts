import type { LanguageModelProvider } from "@voice-agent/pipeline";
import type { LlmCallInfo } from "@voice-agent/shared";
import { z } from "zod";
import { formatContext, type CallContext } from "./context";
import { llmCallInfo } from "./llm-info";

// Long-term memory per caller: a few short facts, stored by phone number, that the agent sees
// on the caller's next call ("Ali prefers Saturdays", "booked balayage with Priya, BK-7Q2M").
// At the end of a call the decisions model updates the facts from the call; code then checks
// them (limits, and no card numbers).

export interface CallerMemory {
  phoneNumber: string;
  facts: string[];
  /** Calls the memory was updated from. */
  callCount: number;
  lastCallAt: string;
}

/** Where memories are kept, per business. */
export interface CallerMemoryStore {
  get(phoneNumber: string): Promise<CallerMemory | null>;
  save(phoneNumber: string, facts: string[]): Promise<CallerMemory>;
  forget(phoneNumber: string): Promise<boolean>;
}

const MAX_FACTS = 8;
const MAX_FACT_CHARS = 200;

/** "+44 7700 900123" and "07700-900123" are different numbers; spaces and dashes don't matter. */
export function normalizePhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

/** The facts to keep after this call: the old ones updated with what the call added. */
export async function updateMemoryFacts(
  llm: LanguageModelProvider,
  businessName: string,
  previous: string[],
  call: CallContext,
): Promise<{ facts: string[]; llm: LlmCallInfo }> {
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          `You keep a short memory about callers of ${businessName}, for their next call.`,
          "Update the facts with what this call adds. Keep facts that help next time: the",
          "caller's name, preferences (stylist, days, times), services they had or asked about,",
          "bookings (service, date, time, reference) and problems or complaints.",
          "Only write what the caller said or what was actually done: a booking counts only if",
          "the agent confirmed it. Don't write what didn't happen or wasn't mentioned.",
          'Mark each fact "caller" (about this caller) or "business" (prices, policies, staff).',
          "Remove facts the call made out of date (e.g. a cancelled booking). Never store payment",
          `details, passwords or health information. At most ${MAX_FACTS} facts, each one short`,
          "sentence; fewer is better. If the call adds nothing, return the old facts.",
          'Answer with JSON: { "facts": [{ "fact": "...", "about": "caller" }, ...] }',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Facts from earlier calls:",
          ...(previous.length ? previous.map((fact) => `- ${fact}`) : ["(none)"]),
          "",
          "This call:",
          formatContext(call),
        ].join("\n"),
      },
    ],
    {
      temperature: 0,
      jsonSchema: {
        name: "caller_memory",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["facts"],
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["fact", "about"],
                properties: {
                  fact: { type: "string" },
                  about: { type: "string", enum: ["caller", "business"] },
                },
              },
            },
          },
        },
      },
    },
  );
  const parsed = FactsSchema.safeParse(safeJson(result.text));
  // Unreadable answer: keep what we had rather than wiping the memory. Facts about the business
  // are dropped in code: told not to store them, small models stored them anyway (4 of 8).
  const facts = parsed.success
    ? checkFacts(parsed.data.facts.filter((f) => f.about === "caller").map((f) => f.fact))
    : previous;
  return { facts, llm: llmCallInfo(result) };
}

/** The code's checks on what the AI wants to store. */
export function checkFacts(facts: string[]): string[] {
  return facts
    .map((fact) => fact.trim())
    .filter((fact) => fact.length > 0 && fact.length <= MAX_FACT_CHARS)
    .filter((fact) => !looksLikeCardNumber(fact))
    .slice(0, MAX_FACTS);
}

/** 13–19 digits in a row (spaces and dashes allowed between them): a payment card number. */
function looksLikeCardNumber(text: string): boolean {
  return /(?:\d[ -]?){13,19}/.test(text);
}

const FactsSchema = z.object({
  facts: z.array(z.object({ fact: z.string(), about: z.enum(["caller", "business"]) })),
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

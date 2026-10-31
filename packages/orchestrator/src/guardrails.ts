// Guardrails: checks in code around every call, whatever the agent's prompt says.
//
// On what the caller says:
//   - card numbers are removed before anything is stored or sent to a model (PII),
//   - prompt-injection attempts ("ignore your instructions...") are flagged so the AI is told
//     to stay in its role,
//   - asking for a person, or being clearly upset, sends the call to the flow's Transfer step.
// On what the AI replies:
//   - grounding: every price or percentage it states must appear in what it was given (notes,
//     business rules, the caller's words). Prices can be said in words ("thirty pounds").
//   - policy: no promised discounts and no reading out its own instructions.
// A reply that fails is written again once with the problem explained, then replaced by a safe
// answer. The AI understands; the code checks.

const CARD_NUMBER = /\+?\b(?:\d[ -]?){13,19}\b/g;

/**
 * Removes card numbers from what the caller said. A number starting with + or 0 is a phone
 * number, however long ("+49 151 12345678"): no card starts that way.
 */
export function redactCaller(text: string): { text: string; redacted: boolean } {
  const redacted = text.replace(CARD_NUMBER, (number) =>
    /^[+0]/.test(number) ? number : "[card number removed]",
  );
  return { text: redacted, redacted: redacted !== text };
}

const INJECTION = [
  /\bignore (all |any |your |the )?(previous |prior |earlier )?(instructions|rules|prompt)/i,
  /\b(system|developer) (prompt|message|instructions)\b/i,
  /\b(reveal|repeat|read out|print|show me) (your|the) (instructions|prompt|rules)\b/i,
  /\byou are now\b|\bdeveloper mode\b|\bjailbreak\b|\bact as (an?|my) /i,
  /\bnew instructions\b|\boverride (your|the) /i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION.some((pattern) => pattern.test(text));
}

const WANTS_HUMAN = [
  /\b(speak|talk|put me through) (to|with) (a |an |the )?(human|person|someone|manager|real person|member of staff|receptionist)\b/i,
  /\b(real|actual) (person|human)\b/i,
  /\bare you a (robot|bot|machine)\b.*\b(person|human)\b/i,
  /\b(this is (useless|ridiculous|a joke)|waste of (my )?time|you('re| are) not (listening|helping))\b/i,
];

/** The caller asks for a person, or is clearly fed up with the agent. */
export function wantsHuman(text: string): boolean {
  return WANTS_HUMAN.some((pattern) => pattern.test(text));
}

// ----- Replies --------------------------------------------------------------------------------

const SMALL: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** "one hundred and eighty" → 180, "thirty five" → 35. Null if it isn't a number in words. */
export function wordsToNumber(words: string): number | null {
  const parts = words
    .toLowerCase()
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "and");
  if (parts.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const word of parts) {
    if (word === "a" && current === 0) current = 1;
    else if (word in SMALL) current += SMALL[word]!;
    else if (word === "hundred") current = (current || 1) * 100;
    else if (word === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else return null;
  }
  return total + current;
}

const NUMBER_WORDS = `(?:(?:a|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[\\s-]+)+`;

/** Prices (£30, 30 pounds, thirty pounds) and percentages (50%, fifty percent) in a text. */
export function amountsIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(
    /£\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:pounds?|quid)\b/gi,
  )) {
    found.push(`£${Number(m[1] ?? m[2])}`);
  }
  for (const m of text.matchAll(new RegExp(`\\b(${NUMBER_WORDS})(?:pounds?|quid)\\b`, "gi"))) {
    const value = wordsToNumber(m[1]!.trim());
    if (value !== null) found.push(`£${value}`);
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?(?:%|per ?cent)/gi))
    found.push(`${Number(m[1])}%`);
  for (const m of text.matchAll(new RegExp(`\\b(${NUMBER_WORDS})per ?cent\\b`, "gi"))) {
    const value = wordsToNumber(m[1]!.trim());
    if (value !== null) found.push(`${value}%`);
  }
  return [...new Set(found)];
}

const DISCOUNT_PROMISE =
  /\b(I('| wi)ll|I can|we('| wi)ll|we can|happy to|let me)\b[^.?!]*\b(discount|% off|percent off|half price|for free|free of charge|waive)/i;
const LEAK =
  /\b(platform rules|business rules|system prompt|my instructions (are|say)|I was (told|instructed) to)\b/i;

export interface ReplyProblem {
  kind: "ungrounded" | "policy";
  detail: string;
}

export interface ReplySources {
  /** Everything the reply may take facts from: notes, rules, the caller's words, saved answers. */
  facts: string;
  /** What the business said (notes, rules, step instructions), not the caller: a caller asking
   * for a discount doesn't make one allowed. */
  business: string;
}

/** Problems with an AI reply. Empty when the reply is fine. */
export function checkReply(reply: string, sources: ReplySources): ReplyProblem[] {
  const problems: ReplyProblem[] = [];
  const known = new Set(amountsIn(sources.facts));
  const invented = amountsIn(reply).filter((amount) => !known.has(amount));
  if (invented.length) {
    problems.push({
      kind: "ungrounded",
      detail: `It said ${invented.join(", ")}, which isn't in anything it was given.`,
    });
  }
  // A discount or free service the business mentions is fine; otherwise nobody offered it.
  if (DISCOUNT_PROMISE.test(reply) && !/discount|free|% off|half price/i.test(sources.business)) {
    problems.push({ kind: "policy", detail: "It promised a discount or something for free." });
  }
  if (LEAK.test(reply)) {
    problems.push({ kind: "policy", detail: "It talked about its own instructions." });
  }
  return problems;
}

/** Said instead of a reply that failed the checks twice. */
export const SAFE_REPLY =
  "I'm sorry, I can't confirm that right now. I can ask a colleague to call you back, or is there anything else I can help with?";

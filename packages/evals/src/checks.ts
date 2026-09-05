import type {
  ConversationEvent,
  ConversationState,
  EvalCheck,
  ScriptExpectations,
} from "@voice-agent/shared";

// Code checks for script cases: facts about the call that need no judgement.

export function checkScript(
  expect: ScriptExpectations,
  state: ConversationState | null,
  events: ConversationEvent[],
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const agentSaid = (state?.transcript ?? [])
    .filter((entry) => entry.role === "agent")
    .map((entry) => entry.text)
    .join("\n");

  if (expect.endsWith) {
    const ending = events.findLast((e) => e.type === "end" || e.type === "transfer")?.type;
    const actual = state?.nodeId === null ? (ending ?? "stuck") : "stillTalking";
    checks.push({
      name: `Call ${describeEnding(expect.endsWith)}`,
      passed: actual === expect.endsWith,
      detail: actual === expect.endsWith ? "As expected." : `It ${describeEnding(actual)}.`,
    });
  }

  for (const [variable, wanted] of Object.entries(expect.variables)) {
    const saved = state?.variables[variable];
    checks.push({
      name: `Saved ${variable} = "${wanted}"`,
      passed: saved?.trim().toLowerCase() === wanted.trim().toLowerCase(),
      detail: saved === undefined ? "Not saved." : `Saved "${saved}".`,
    });
  }

  for (const phrase of expect.mustSay) {
    const found = findPhrase(agentSaid, phrase);
    checks.push({
      name: `Says "${phrase}"`,
      passed: found !== null,
      detail: found ? `Said "${found}".` : "Never said.",
    });
  }

  for (const phrase of expect.mustNotSay) {
    const found = findPhrase(agentSaid, phrase);
    checks.push({
      name: `Never says "${phrase}"`,
      passed: found === null,
      detail: found ? `Said "${found}".` : "Never said.",
    });
  }

  const visited = new Set(events.flatMap((e) => ("nodeId" in e && e.nodeId ? [e.nodeId] : [])));
  for (const step of expect.visits) {
    checks.push({
      name: `Goes through step "${step}"`,
      passed: visited.has(step),
      detail: visited.has(step) ? "It did." : "It didn't.",
    });
  }
  return checks;
}

/** The first alternative of "£30|thirty pounds" found in the text (ignoring case), or null. */
export function findPhrase(text: string, phrase: string): string | null {
  const lower = text.toLowerCase();
  for (const option of phrase
    .split("|")
    .map((o) => o.trim())
    .filter(Boolean)) {
    if (lower.includes(option.toLowerCase())) return option;
  }
  return null;
}

function describeEnding(ending: string): string {
  return (
    { end: "ends", transfer: "is transferred", stillTalking: "is still going", stuck: "stops" }[
      ending
    ] ?? ending
  );
}

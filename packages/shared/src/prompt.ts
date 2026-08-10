import { z } from "zod";
import { renderTemplate } from "./template";

// The agent's prompt settings (the prompt studio) and how they become the system prompt sent
// to the language model. Lives in `shared` so the editor's live preview and the server build
// exactly the same text.

export const FewShotExampleSchema = z.object({
  id: z.string().min(1),
  caller: z.string(),
  agent: z.string(),
});

export const VoiceStyleSchema = z.object({
  shortSentences: z.boolean(),
  noFormatting: z.boolean(),
  spokenNumbers: z.boolean(),
  oneQuestionAtATime: z.boolean(),
});

export const PromptSettingsSchema = z.object({
  // Fills {{business_name}} everywhere.
  businessName: z.string(),
  // Who the agent is. Usually starts with "You are ...".
  role: z.string(),
  // Tone and personality.
  persona: z.string(),
  // What a good call achieves.
  goals: z.string(),
  // Business rules, e.g. "Never promise refunds".
  rules: z.string(),
  voiceStyle: VoiceStyleSchema,
  // Few-shot examples: sample exchanges that show the wanted style.
  examples: z.array(FewShotExampleSchema).max(10),
});

export type PromptSettings = z.infer<typeof PromptSettingsSchema>;
export type FewShotExample = z.infer<typeof FewShotExampleSchema>;
export type VoiceStyle = z.infer<typeof VoiceStyleSchema>;

/** Used for new agents, and for versions saved before prompt settings existed. */
export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  businessName: "our business",
  role: "You are the friendly phone receptionist for {{business_name}}.",
  persona: "Warm, patient and professional. Sound like a helpful person, not a robot.",
  goals: "Help every caller quickly and make sure they feel looked after.",
  rules: "",
  voiceStyle: {
    shortSentences: true,
    noFormatting: true,
    spokenNumbers: true,
    oneQuestionAtATime: true,
  },
  examples: [],
};

export const VOICE_STYLE_RULES: Record<keyof VoiceStyle, { label: string; rule: string }> = {
  shortSentences: {
    label: "Short replies",
    rule: "Reply in one to three short sentences.",
  },
  noFormatting: {
    label: "No formatting",
    rule: "No lists, markdown, emojis or links: everything is spoken aloud.",
  },
  spokenNumbers: {
    label: "Spoken numbers",
    rule: 'Say numbers, times and dates the way people speak them, e.g. "half past three" or "the twelfth of March", not "15:30" or "12/03".',
  },
  oneQuestionAtATime: {
    label: "One question at a time",
    rule: "Ask at most one question per reply.",
  },
};

// Not editable: these protect callers and the business whatever the prompt says.
const PLATFORM_RULES = [
  "Only state facts given in these instructions (including the business rules and examples) or in the conversation. Never invent available times, prices, opening hours or booking details.",
  "If your task needs information you don't have (for example a tool or the knowledge base returned nothing), don't make it up: say briefly that you can't confirm it right now, then help another way, such as noting the caller's preference for the team.",
];

/** Variables every flow and prompt can use, besides the answers collected by Ask steps. */
export const BUILT_IN_VARIABLES = ["business_name", "today"] as const;

export function builtInVariables(settings: PromptSettings, now: Date): Record<string, string> {
  return {
    business_name: settings.businessName.trim() || DEFAULT_PROMPT_SETTINGS.businessName,
    today: now.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

/**
 * The system prompt for an AI response step. Sections in a fixed order:
 * role, personality, goals, business rules, voice style, platform rules, examples,
 * then the step's task and what is known about the caller.
 */
export function buildSystemPrompt(
  settings: PromptSettings,
  step: { instructions: string; variables: Readonly<Record<string, string>> },
): string {
  const fill = (text: string) => renderTemplate(text.trim(), step.variables);
  const sections: string[] = [];

  if (settings.role.trim()) sections.push(fill(settings.role));
  if (settings.persona.trim()) sections.push(`Personality: ${fill(settings.persona)}`);
  if (settings.goals.trim()) sections.push(`Goals: ${fill(settings.goals)}`);
  if (settings.rules.trim()) sections.push(`Business rules:\n${fill(settings.rules)}`);

  const style = (Object.keys(VOICE_STYLE_RULES) as (keyof VoiceStyle)[])
    .filter((key) => settings.voiceStyle[key])
    .map((key) => `- ${VOICE_STYLE_RULES[key].rule}`);
  sections.push(
    ["You are on a live phone call: everything you write is spoken aloud.", ...style].join("\n"),
  );
  sections.push(["Always:", ...PLATFORM_RULES.map((rule) => `- ${rule}`)].join("\n"));

  const examples = settings.examples.filter((e) => e.caller.trim() && e.agent.trim());
  if (examples.length > 0) {
    sections.push(
      [
        "Examples of the style to use (examples only, not part of this call):",
        ...examples.map((e) => `Caller: ${fill(e.caller)}\nAgent: ${fill(e.agent)}`),
      ].join("\n\n"),
    );
  }

  const known = Object.entries(step.variables).map(([name, value]) => `- ${name}: ${value}`);
  sections.push(`Your task for this step: ${fill(step.instructions)}`);
  sections.push(["What you know:", ...(known.length ? known : ["- nothing yet"])].join("\n"));
  return sections.join("\n\n");
}

/** Rough token count (about 4 characters per token in English). Real counts come from the API. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

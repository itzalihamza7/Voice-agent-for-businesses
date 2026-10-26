import { describe, expect, it } from "vitest";
import { AgentConfigSchema } from "./agent-config";
import {
  buildSystemPrompt,
  builtInVariables,
  DEFAULT_PROMPT_SETTINGS,
  estimateTokens,
  type PromptSettings,
} from "./prompt";

const settings: PromptSettings = {
  ...DEFAULT_PROMPT_SETTINGS,
  businessName: "Shine Salon",
  rules: "Never promise refunds.",
  examples: [{ id: "x1", caller: "Are you open?", agent: "We are! How can I help?" }],
};
const step = {
  instructions: "Greet the caller by name.",
  variables: { business_name: "Shine Salon", caller_name: "Ali" },
};

describe("buildSystemPrompt", () => {
  it("assembles the sections in order and fills {{variables}}", () => {
    const prompt = buildSystemPrompt(settings, step);
    const order = [
      "You are the friendly phone receptionist for Shine Salon.",
      "Personality: Warm",
      "Goals: Help every caller",
      "Business rules:\nNever promise refunds.",
      "You are on a live phone call",
      "Always:",
      "Examples of the style to use",
      "Caller: Are you open?\nAgent: We are! How can I help?",
      "Your task for this step: Greet the caller by name.",
      "What you know:\n- business_name: Shine Salon\n- caller_name: Ali",
    ].map((part) => prompt.indexOf(part));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("includes only the voice style rules that are switched on", () => {
    const prompt = buildSystemPrompt(
      { ...settings, voiceStyle: { ...settings.voiceStyle, spokenNumbers: false } },
      step,
    );
    expect(prompt).toContain("Reply in one to three short sentences.");
    expect(prompt).not.toContain("half past three");
  });

  it("writes for reading in a website chat, not for speaking", () => {
    const prompt = buildSystemPrompt(settings, step, "text");
    expect(prompt).toContain("chatting by text on the business's website");
    expect(prompt).toContain("LX-7ZTAM3");
    expect(prompt).not.toContain("spoken aloud");
    expect(prompt).not.toContain("half past three");
    expect(prompt).toContain("Reply in one to three short sentences.");
  });

  it("leaves out empty sections and unfinished examples", () => {
    const prompt = buildSystemPrompt(
      { ...settings, rules: " ", examples: [{ id: "x", caller: "Hi", agent: "" }] },
      step,
    );
    expect(prompt).not.toContain("Business rules");
    expect(prompt).not.toContain("Examples of the style");
  });
});

describe("prompt settings", () => {
  it("gives versions saved before prompt settings existed the defaults", () => {
    const old = AgentConfigSchema.parse({
      schemaVersion: 1,
      agentId: "a",
      version: 1,
      name: "Old agent",
      providers: { stt: "mock", llm: "mock", tts: "mock" },
      flow: { nodes: [], edges: [] },
    });
    expect(old.prompt).toEqual(DEFAULT_PROMPT_SETTINGS);
    old.prompt.examples.push({ id: "e", caller: "a", agent: "b" });
    expect(DEFAULT_PROMPT_SETTINGS.examples).toEqual([]); // the default isn't shared
  });

  it("provides {{business_name}} and {{today}}", () => {
    const vars = builtInVariables(settings, new Date(2026, 7, 10));
    expect(vars).toEqual({ business_name: "Shine Salon", today: "Monday, August 10, 2026" });
    expect(builtInVariables({ ...settings, businessName: " " }, new Date()).business_name).toBe(
      "our business",
    );
  });

  it("estimates about four characters per token", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });
});

import type { ChatMessage, LanguageModelProvider } from "@voice-agent/pipeline";
import { DEFAULT_PROMPT_SETTINGS } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { runPromptPlayground } from "./playground";

describe("runPromptPlayground", () => {
  it("runs one reply with the given prompt and returns the prompt it used", async () => {
    const seen: ChatMessage[][] = [];
    const llm: LanguageModelProvider = {
      name: "fake",
      model: "fake-1",
      async complete(messages) {
        seen.push(messages);
        return { text: "Hi Ali!", model: "fake-1", latencyMs: 3, usage: null, costUsd: 0 };
      },
    };
    const result = await runPromptPlayground(llm, {
      prompt: { ...DEFAULT_PROMPT_SETTINGS, businessName: "Shine Salon" },
      instructions: "Greet {{caller_name}}.",
      callerMessage: "Hello?",
      variables: { caller_name: "Ali" },
    });

    expect(result.reply).toBe("Hi Ali!");
    expect(result.systemPrompt).toContain("receptionist for Shine Salon");
    expect(result.systemPrompt).toContain("Your task for this step: Greet Ali.");
    expect(seen[0]![0]!.content).toBe(result.systemPrompt);
    expect(seen[0]![1]!.content).toContain("Caller: Hello?");
    expect(result.llm).toMatchObject({ model: "fake-1", costUsd: 0 });
  });
});

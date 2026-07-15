import { describe, expect, it } from "vitest";
import { runTurn } from "./pipeline";
import { createProviders } from "./registry";

describe("createProviders", () => {
  it("builds the mock providers by name", () => {
    const providers = createProviders({ stt: "mock", llm: "mock", tts: "mock" });
    expect(providers.stt.name).toBe("mock");
    expect(providers.llm.name).toBe("mock");
    expect(providers.tts.name).toBe("mock");
  });

  it("throws on an unknown provider name", () => {
    expect(() => createProviders({ stt: "nope", llm: "mock", tts: "mock" })).toThrow(
      'Unknown stt provider "nope"',
    );
  });
});

describe("runTurn", () => {
  it("passes data through STT -> LLM -> TTS using the mocks", async () => {
    const providers = createProviders({ stt: "mock", llm: "mock", tts: "mock" });
    const result = await runTurn(providers, new Uint8Array(0));
    expect(result.callerText).toBe("Hello, I have a question about my order.");
    expect(result.agentText).toBe("Sure, I can help with that. What is your order number?");
    expect(result.agentAudio).toBeInstanceOf(Uint8Array);
  });
});

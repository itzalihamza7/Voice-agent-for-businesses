import { InMemoryAgentConfigStore } from "@voice-agent/agent-config";
import { DEFAULT_PROMPT_SETTINGS } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { startSession } from "./session";

describe("startSession", () => {
  it("loads the latest config and builds its providers", async () => {
    const store = new InMemoryAgentConfigStore();
    await store.saveNewVersion({
      schemaVersion: 1,
      agentId: "agent-1",
      name: "Support bot",
      providers: { stt: "mock", llm: "mock", tts: "mock" },
      flow: { nodes: [], edges: [] },
      prompt: DEFAULT_PROMPT_SETTINGS,
    });

    const session = await startSession(store, "agent-1");
    expect(session.config.version).toBe(1);
    expect(session.providers.llm.name).toBe("mock");
  });

  it("throws for an agent with no config", async () => {
    const store = new InMemoryAgentConfigStore();
    await expect(startSession(store, "missing")).rejects.toThrow('Agent "missing"');
  });
});

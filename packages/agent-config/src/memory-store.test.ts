import type { AgentConfig } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { InMemoryAgentConfigStore } from "./memory-store";

const draft: Omit<AgentConfig, "version"> = {
  schemaVersion: 1,
  agentId: "agent-1",
  name: "Support bot",
  providers: { stt: "mock", llm: "mock", tts: "mock" },
  flow: { nodes: [], edges: [] },
};

describe("InMemoryAgentConfigStore", () => {
  it("numbers versions 1, 2, 3... and keeps old ones", async () => {
    const store = new InMemoryAgentConfigStore();
    await store.saveNewVersion(draft);
    await store.saveNewVersion({ ...draft, name: "Support bot v2" });

    expect((await store.getLatest("agent-1"))?.version).toBe(2);
    expect((await store.getVersion("agent-1", 1))?.name).toBe("Support bot");
    expect(await store.listVersions("agent-1")).toHaveLength(2);
  });

  it("rejects an invalid config", async () => {
    const store = new InMemoryAgentConfigStore();
    await expect(store.saveNewVersion({ ...draft, name: "" })).rejects.toThrow();
  });
});

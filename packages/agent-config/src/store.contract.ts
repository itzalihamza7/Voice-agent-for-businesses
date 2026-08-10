import { DEFAULT_PROMPT_SETTINGS, type AgentConfig } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import type { AgentConfigStore } from "./store";

// Behaviour every AgentConfigStore must have. Each implementation's test file calls this,
// so the in-memory mock and the Postgres store are guaranteed to behave the same way.

export function draftFor(agentId: string, name = "Support bot"): Omit<AgentConfig, "version"> {
  return {
    schemaVersion: 1,
    agentId,
    name,
    providers: { stt: "mock", llm: "mock", tts: "mock" },
    flow: { nodes: [], edges: [] },
    prompt: DEFAULT_PROMPT_SETTINGS,
  };
}

export function describeAgentConfigStore(
  name: string,
  // Must return an empty store. `newId` gives ids that are unique per test run.
  makeStore: () => Promise<AgentConfigStore>,
  newId: () => string,
) {
  describe(`${name} (AgentConfigStore contract)`, () => {
    it("numbers versions 1, 2, 3... and keeps old ones", async () => {
      const store = await makeStore();
      const id = newId();
      await store.saveNewVersion(draftFor(id));
      await store.saveNewVersion(draftFor(id, "Support bot v2"));

      expect((await store.getLatest(id))?.version).toBe(2);
      expect((await store.getVersion(id, 1))?.name).toBe("Support bot");
      expect((await store.listVersions(id)).map((c) => c.version)).toEqual([1, 2]);
    });

    it("returns null / empty for unknown agents", async () => {
      const store = await makeStore();
      const id = newId();
      expect(await store.getLatest(id)).toBeNull();
      expect(await store.getVersion(id, 1)).toBeNull();
      expect(await store.listVersions(id)).toEqual([]);
    });

    it("rejects an invalid config and saves nothing", async () => {
      const store = await makeStore();
      const id = newId();
      await expect(store.saveNewVersion({ ...draftFor(id), name: "" })).rejects.toThrow();
      expect(await store.getLatest(id)).toBeNull();
    });

    it("lists agents with their latest version, most recently updated first", async () => {
      const store = await makeStore();
      const a = newId();
      const b = newId();
      await store.saveNewVersion(draftFor(a, "Agent A"));
      await store.saveNewVersion(draftFor(b, "Agent B"));
      await store.saveNewVersion(draftFor(a, "Agent A v2"));

      const agents = await store.listAgents();
      expect(agents.map((s) => [s.agentId, s.name, s.latestVersion])).toEqual([
        [a, "Agent A v2", 2],
        [b, "Agent B", 1],
      ]);
    });

    it("gives distinct version numbers to concurrent saves", async () => {
      const store = await makeStore();
      const id = newId();
      await store.saveNewVersion(draftFor(id));
      await Promise.all(Array.from({ length: 5 }, () => store.saveNewVersion(draftFor(id))));
      expect((await store.listVersions(id)).map((c) => c.version)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("handles concurrent saves that create the same new agent", async () => {
      const store = await makeStore();
      const id = newId();
      await Promise.all(Array.from({ length: 3 }, () => store.saveNewVersion(draftFor(id))));
      expect((await store.listVersions(id)).map((c) => c.version)).toEqual([1, 2, 3]);
    });
  });
}

import { InMemoryAgentConfigStore } from "@voice-agent/agent-config";
import { describe, expect, it } from "vitest";
import {
  AgentNotFoundError,
  createAgent,
  listAgents,
  listAgentVersions,
  saveAgentVersion,
} from "./agents";

describe("agent use cases", () => {
  it("creates an agent with a starter config as version 1", async () => {
    const store = new InMemoryAgentConfigStore();
    const agent = await createAgent(store, { name: "Front desk" });

    expect(agent.version).toBe(1);
    expect(agent.flow.nodes.map((n) => n.type)).toEqual(["start"]);
    expect((await listAgents(store)).map((a) => a.name)).toEqual(["Front desk"]);
  });

  it("saves new versions of an existing agent", async () => {
    const store = new InMemoryAgentConfigStore();
    const { agentId, version, ...draft } = await createAgent(store, { name: "Front desk" });

    const v2 = await saveAgentVersion(store, agentId, { ...draft, name: "Front desk v2" });
    expect(v2.version).toBe(2);
    expect((await listAgentVersions(store, agentId)).map((v) => v.name)).toEqual([
      "Front desk",
      "Front desk v2",
    ]);
  });

  it("refuses to save or list versions for an unknown agent", async () => {
    const store = new InMemoryAgentConfigStore();
    const { agentId, version, ...draft } = await createAgent(store, { name: "A" });

    await expect(saveAgentVersion(store, "missing", draft)).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
    await expect(listAgentVersions(store, "missing")).rejects.toBeInstanceOf(AgentNotFoundError);
  });
});

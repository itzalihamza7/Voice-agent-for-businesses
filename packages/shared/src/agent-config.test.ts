import { describe, expect, it } from "vitest";
import { AgentConfigSchema } from "./agent-config";

const validConfig = {
  schemaVersion: 1,
  agentId: "agent-1",
  version: 1,
  name: "Support bot",
  providers: { stt: "mock", llm: "mock", tts: "mock" },
  flow: {
    nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  },
};

describe("AgentConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(AgentConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it("rejects a config without providers", () => {
    const withoutProviders = { ...validConfig, providers: undefined };
    expect(AgentConfigSchema.safeParse(withoutProviders).success).toBe(false);
  });
});

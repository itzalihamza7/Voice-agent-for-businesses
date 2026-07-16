import { AgentConfigSchema, type AgentConfig } from "@voice-agent/shared";
import type { AgentConfigStore } from "./store";

// In-memory store for tests and local development. Data is lost on restart.
export class InMemoryAgentConfigStore implements AgentConfigStore {
  private readonly versionsByAgent = new Map<string, AgentConfig[]>();

  async saveNewVersion(config: Omit<AgentConfig, "version">): Promise<AgentConfig> {
    const versions = this.versionsByAgent.get(config.agentId) ?? [];
    const saved = AgentConfigSchema.parse({ ...config, version: versions.length + 1 });
    this.versionsByAgent.set(config.agentId, [...versions, saved]);
    return saved;
  }

  async getLatest(agentId: string): Promise<AgentConfig | null> {
    return this.versionsByAgent.get(agentId)?.at(-1) ?? null;
  }

  async getVersion(agentId: string, version: number): Promise<AgentConfig | null> {
    return this.versionsByAgent.get(agentId)?.find((c) => c.version === version) ?? null;
  }

  async listVersions(agentId: string): Promise<AgentConfig[]> {
    return this.versionsByAgent.get(agentId) ?? [];
  }
}

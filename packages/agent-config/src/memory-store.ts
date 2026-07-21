import { AgentConfigSchema, type AgentConfig, type AgentSummary } from "@voice-agent/shared";
import type { AgentConfigStore } from "./store";

interface StoredAgent {
  versions: AgentConfig[];
  updatedAt: Date;
}

// In-memory store for tests and local development. Data is lost on restart.
export class InMemoryAgentConfigStore implements AgentConfigStore {
  private readonly agents = new Map<string, StoredAgent>();

  async saveNewVersion(config: Omit<AgentConfig, "version">): Promise<AgentConfig> {
    const versions = this.agents.get(config.agentId)?.versions ?? [];
    const saved = AgentConfigSchema.parse({ ...config, version: versions.length + 1 });
    // Delete + set moves the agent to the end, so Map order = least recently updated first.
    this.agents.delete(config.agentId);
    this.agents.set(config.agentId, { versions: [...versions, saved], updatedAt: new Date() });
    return saved;
  }

  async getLatest(agentId: string): Promise<AgentConfig | null> {
    return this.agents.get(agentId)?.versions.at(-1) ?? null;
  }

  async getVersion(agentId: string, version: number): Promise<AgentConfig | null> {
    return this.agents.get(agentId)?.versions.find((c) => c.version === version) ?? null;
  }

  async listVersions(agentId: string): Promise<AgentConfig[]> {
    return this.agents.get(agentId)?.versions ?? [];
  }

  async listAgents(): Promise<AgentSummary[]> {
    return [...this.agents.entries()].reverse().flatMap(([agentId, { versions, updatedAt }]) => {
      const latest = versions.at(-1);
      return latest
        ? [
            {
              agentId,
              name: latest.name,
              latestVersion: latest.version,
              updatedAt: updatedAt.toISOString(),
            },
          ]
        : [];
    });
  }
}

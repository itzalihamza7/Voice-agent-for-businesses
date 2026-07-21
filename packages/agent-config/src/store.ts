import type { AgentConfig, AgentSummary } from "@voice-agent/shared";

// Where versioned agent configs are kept. Versions are never edited or deleted:
// saving always creates a new version, so any old version can be restored.
// Implementations: InMemoryAgentConfigStore (tests) and PrismaAgentConfigStore (PostgreSQL).

export interface AgentConfigStore {
  /**
   * Validates the config and stores it as the next version. Returns the saved config.
   * Creates the agent if it does not exist yet.
   */
  saveNewVersion(config: Omit<AgentConfig, "version">): Promise<AgentConfig>;
  getLatest(agentId: string): Promise<AgentConfig | null>;
  getVersion(agentId: string, version: number): Promise<AgentConfig | null>;
  /** All versions, oldest first. Empty if the agent does not exist. */
  listVersions(agentId: string): Promise<AgentConfig[]>;
  /** All agents, most recently updated first. */
  listAgents(): Promise<AgentSummary[]>;
}

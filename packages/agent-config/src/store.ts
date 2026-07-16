import type { AgentConfig } from "@voice-agent/shared";

// Where versioned agent configs are kept. Versions are never edited or deleted:
// saving always creates a new version, so any old version can be restored.
// A PostgreSQL implementation (using @voice-agent/db) will be added later.

export interface AgentConfigStore {
  /** Validates the config and stores it as the next version. Returns the saved config. */
  saveNewVersion(config: Omit<AgentConfig, "version">): Promise<AgentConfig>;
  getLatest(agentId: string): Promise<AgentConfig | null>;
  getVersion(agentId: string, version: number): Promise<AgentConfig | null>;
  listVersions(agentId: string): Promise<AgentConfig[]>;
}

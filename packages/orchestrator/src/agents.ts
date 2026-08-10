import type { AgentConfigStore } from "@voice-agent/agent-config";
import {
  DEFAULT_PROMPT_SETTINGS,
  type AgentConfig,
  type AgentConfigDraft,
  type AgentSummary,
  type CreateAgentRequest,
} from "@voice-agent/shared";

// Agent management use cases. API routes call these instead of the store directly,
// so the same rules apply no matter who calls (web app today, other apps later).

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent "${agentId}" not found`);
    this.name = "AgentNotFoundError";
  }
}

export function listAgents(store: AgentConfigStore): Promise<AgentSummary[]> {
  return store.listAgents();
}

/** Creates an agent with a new id and a starter config (version 1). */
export function createAgent(
  store: AgentConfigStore,
  request: CreateAgentRequest,
): Promise<AgentConfig> {
  return store.saveNewVersion({
    schemaVersion: 1,
    agentId: crypto.randomUUID(),
    name: request.name,
    providers: { stt: "mock", llm: "mock", tts: "mock" },
    flow: {
      nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    },
    prompt: structuredClone(DEFAULT_PROMPT_SETTINGS),
  });
}

export async function listAgentVersions(
  store: AgentConfigStore,
  agentId: string,
): Promise<AgentConfig[]> {
  const versions = await store.listVersions(agentId);
  if (versions.length === 0) throw new AgentNotFoundError(agentId);
  return versions;
}

/** Saves a new version of an existing agent. Use createAgent for new agents. */
export async function saveAgentVersion(
  store: AgentConfigStore,
  agentId: string,
  draft: AgentConfigDraft,
): Promise<AgentConfig> {
  if (!(await store.getLatest(agentId))) throw new AgentNotFoundError(agentId);
  return store.saveNewVersion({ ...draft, agentId });
}

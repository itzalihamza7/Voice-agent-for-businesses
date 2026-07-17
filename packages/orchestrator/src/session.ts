import type { AgentConfigStore } from "@voice-agent/agent-config";
import { createProviders, type Providers } from "@voice-agent/pipeline";
import type { AgentConfig } from "@voice-agent/shared";

// The thin layer between the outside world (browser, phone gateway) and the AI services.
// It has no HTTP or framework code, so Next.js API routes today and a WebSocket
// voice server later can both call it.
// Later: run turns through the pipeline, follow the agent's flow, save call logs.

export interface Session {
  sessionId: string;
  config: AgentConfig;
  providers: Providers;
}

export async function startSession(store: AgentConfigStore, agentId: string): Promise<Session> {
  const config = await store.getLatest(agentId);
  if (!config) {
    throw new Error(`Agent "${agentId}" has no saved config`);
  }
  return {
    sessionId: crypto.randomUUID(),
    config,
    providers: createProviders(config.providers),
  };
}

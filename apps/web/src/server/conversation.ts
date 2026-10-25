import type { ConversationDeps } from "@voice-agent/orchestrator";
import {
  createLanguageModel,
  FallbackLanguageModel,
  type LanguageModelProvider,
} from "@voice-agent/pipeline";
import type { AgentTools, ModelSpec, PromptSettings } from "@voice-agent/shared";
import { modelEnv } from "./auth";
import { getCallerMemoryStore } from "./caller-memory";
import { getAgentConfigStore, getPrisma } from "./store";
import { knowledgeSearcher } from "./knowledge";
import { loadTools } from "./tools";

// What one conversation request needs: the chosen models (each wrapped with the fallback, if
// any), the agent's tools, the knowledge base and caller memory. Call close() when done: it
// disconnects from MCP servers.

export interface ConversationSettings {
  models: { decisions: ModelSpec | null; replies: ModelSpec | null; fallback: ModelSpec | null };
  prompt?: PromptSettings;
  tools?: AgentTools;
  contextBudget?: number;
}

export async function conversationDeps(
  settings: ConversationSettings,
  /** Whose knowledge base, caller memory, agents and API keys the call uses. */
  businessId: string,
  /** The call these are for (its id goes in the connections' audit log). */
  callId?: string,
): Promise<{ deps: ConversationDeps; close: () => Promise<void> }> {
  const { models, prompt, tools: toolConfig, contextBudget } = settings;
  const env = await modelEnv(businessId);
  const fallback = models.fallback ? createLanguageModel(models.fallback, env) : null;
  const build = (spec: ModelSpec | null): LanguageModelProvider | null => {
    if (!spec) return null;
    const model = createLanguageModel(spec, env);
    return fallback ? new FallbackLanguageModel(model, fallback) : model;
  };
  const resolved = await loadTools(toolConfig, businessId, callId ? { callId } : {});
  return {
    deps: {
      decisions: build(models.decisions),
      replies: build(models.replies),
      ...(prompt ? { prompt } : {}),
      tools: resolved.tools,
      knowledge: knowledgeSearcher(businessId),
      memory: await getCallerMemoryStore(businessId),
      loadAgent: (agentId) => loadLiveAgent(agentId, businessId),
      ...(contextBudget ? { contextBudget } : {}),
    },
    close: resolved.close,
  };
}

/** An agent of the business for Hand off steps: its live version, or the latest. */
async function loadLiveAgent(agentId: string, businessId: string) {
  const store = await getAgentConfigStore(businessId);
  const agent = await getPrisma().agent.findFirst({
    where: { id: agentId, businessId },
    select: { liveVersion: true },
  });
  if (!agent) return null;
  const config =
    (agent.liveVersion ? await store.getVersion(agentId, agent.liveVersion) : null) ??
    (await store.getLatest(agentId));
  return config ? { name: config.name, flow: config.flow, prompt: config.prompt } : null;
}

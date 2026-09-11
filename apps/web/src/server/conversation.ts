import type { ConversationDeps } from "@voice-agent/orchestrator";
import {
  createLanguageModel,
  FallbackLanguageModel,
  type LanguageModelProvider,
} from "@voice-agent/pipeline";
import type { AgentTools, ModelSpec, PromptSettings } from "@voice-agent/shared";
import { getCallerMemoryStore } from "./caller-memory";
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
): Promise<{ deps: ConversationDeps; close: () => Promise<void> }> {
  const { models, prompt, tools: toolConfig, contextBudget } = settings;
  const fallback = models.fallback ? createLanguageModel(models.fallback) : null;
  const build = (spec: ModelSpec | null): LanguageModelProvider | null => {
    if (!spec) return null;
    const model = createLanguageModel(spec);
    return fallback ? new FallbackLanguageModel(model, fallback) : model;
  };
  const resolved = await loadTools(toolConfig);
  return {
    deps: {
      decisions: build(models.decisions),
      replies: build(models.replies),
      ...(prompt ? { prompt } : {}),
      tools: resolved.tools,
      knowledge: knowledgeSearcher(),
      memory: getCallerMemoryStore(),
      ...(contextBudget ? { contextBudget } : {}),
    },
    close: resolved.close,
  };
}

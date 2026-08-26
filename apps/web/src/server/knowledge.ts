import { DEFAULT_BUSINESS_ID } from "@voice-agent/db";
import type { KnowledgeSearcher } from "@voice-agent/orchestrator";
import {
  configuredEmbeddingModels,
  createEmbeddingModel,
  type EmbeddingProvider,
} from "@voice-agent/pipeline";
import { KnowledgeStore, searchKnowledge } from "@voice-agent/rag";
import { getPrisma } from "./store";

// Server-only wiring for the knowledge base. Every request uses the demo business until auth
// exists (roadmap phase 15); the store filters every query by it.

export function getKnowledgeStore(): KnowledgeStore {
  return new KnowledgeStore(getPrisma(), DEFAULT_BUSINESS_ID);
}

/** Every configured embedding model (documents are embedded with all of them). */
export function embeddingModels(): EmbeddingProvider[] {
  return configuredEmbeddingModels().map((id) => createEmbeddingModel(id));
}

/** The embedding model used for searching in calls: the first configured one. */
export function defaultEmbeddingModel(): EmbeddingProvider {
  return createEmbeddingModel(configuredEmbeddingModels()[0]!);
}

/** The knowledge base as the conversation engine sees it. */
export function knowledgeSearcher(): KnowledgeSearcher {
  const store = getKnowledgeStore();
  const embedding = defaultEmbeddingModel();
  return { search: (options) => searchKnowledge(store, { ...options, embedding }) };
}

export const allowPrivateHosts = () => process.env.TOOLS_ALLOW_PRIVATE_HOSTS === "true";

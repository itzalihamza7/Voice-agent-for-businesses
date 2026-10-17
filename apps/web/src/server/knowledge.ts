import type { KnowledgeSearcher } from "@voice-agent/orchestrator";
import {
  configuredEmbeddingModels,
  createEmbeddingModel,
  type EmbeddingProvider,
} from "@voice-agent/pipeline";
import { KnowledgeStore, searchKnowledge } from "@voice-agent/rag";
import { currentBusinessId } from "./business";
import { getPrisma } from "./store";

// Server-only wiring for the knowledge base. The store filters every query by the business.

export async function getKnowledgeStore(businessId?: string): Promise<KnowledgeStore> {
  return new KnowledgeStore(getPrisma(), businessId ?? (await currentBusinessId()));
}

/** Every configured embedding model (documents are embedded with all of them). */
export function embeddingModels(): EmbeddingProvider[] {
  return configuredEmbeddingModels().map((id) => createEmbeddingModel(id));
}

/** The embedding model used for searching in calls: the first configured one. */
export function defaultEmbeddingModel(): EmbeddingProvider {
  return createEmbeddingModel(configuredEmbeddingModels()[0]!);
}

/** A business's knowledge base as the conversation engine sees it. */
export function knowledgeSearcher(businessId: string): KnowledgeSearcher {
  const store = new KnowledgeStore(getPrisma(), businessId);
  const embedding = defaultEmbeddingModel();
  return { search: (options) => searchKnowledge(store, { ...options, embedding }) };
}

export const allowPrivateHosts = () => process.env.TOOLS_ALLOW_PRIVATE_HOSTS === "true";

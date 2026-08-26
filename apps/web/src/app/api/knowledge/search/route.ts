// POST /api/knowledge/search { query, mode, limit, embeddingModel, rewrite, rerank }: the search
// playground. Returns the keyword, vector and final results separately, to compare them.
import {
  createEmbeddingModel,
  createLanguageModel,
  ProviderConfigError,
} from "@voice-agent/pipeline";
import { searchKnowledge } from "@voice-agent/rag";
import { ModelSpecSchema } from "@voice-agent/shared";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { getKnowledgeStore } from "@/server/knowledge";

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(1_000),
  mode: z.enum(["hybrid", "vector", "keyword"]),
  limit: z.number().int().min(1).max(10).default(5),
  embeddingModel: z.string().min(1),
  // Language models for the optional AI steps; null = off.
  rewrite: ModelSpecSchema.nullable().default(null),
  rerank: ModelSpecSchema.nullable().default(null),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SearchSchema);
  if ("response" in parsed) return parsed.response;
  const { query, mode, limit, embeddingModel, rewrite, rerank } = parsed.data;
  try {
    return Response.json(
      await searchKnowledge(getKnowledgeStore(), {
        query,
        mode,
        limit,
        embedding: createEmbeddingModel(embeddingModel),
        rewriteWith: rewrite ? createLanguageModel(rewrite) : null,
        rerankWith: rerank ? createLanguageModel(rerank) : null,
      }),
    );
  } catch (error) {
    const status = error instanceof ProviderConfigError ? 400 : 502;
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}

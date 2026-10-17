// POST /api/knowledge/retrieval-eval { mode, embeddingModel, rerank }: recall@1, recall@3 and
// MRR of the knowledge base on the example question set (needs the example documents).
import { EXAMPLE_RETRIEVAL_QUESTIONS, evaluateRetrieval } from "@voice-agent/evals";
import {
  configuredEmbeddingModels,
  createEmbeddingModel,
  createLanguageModel,
} from "@voice-agent/pipeline";
import { ModelSpecSchema } from "@voice-agent/shared";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { getKnowledgeStore } from "@/server/knowledge";
import { modelEnv } from "@/server/auth";
import { currentBusinessId } from "@/server/business";

const RetrievalEvalSchema = z.object({
  mode: z.enum(["hybrid", "vector", "keyword"]),
  embeddingModel: z.string().min(1),
  rerank: ModelSpecSchema.nullable(),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, RetrievalEvalSchema);
  if ("response" in parsed) return parsed.response;
  const { mode, embeddingModel, rerank } = parsed.data;
  if (!configuredEmbeddingModels().includes(embeddingModel)) {
    return Response.json(
      { error: `Unknown embedding model "${embeddingModel}".` },
      { status: 400 },
    );
  }
  try {
    const report = await evaluateRetrieval(await getKnowledgeStore(), EXAMPLE_RETRIEVAL_QUESTIONS, {
      mode,
      embedding: mode === "keyword" ? null : createEmbeddingModel(embeddingModel),
      rerankWith: rerank
        ? createLanguageModel(rerank, await modelEnv(await currentBusinessId()))
        : null,
    });
    return Response.json({ report });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

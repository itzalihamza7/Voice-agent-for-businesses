import type { EmbeddingProvider, LanguageModelProvider } from "@voice-agent/pipeline";
import { searchKnowledge, type KnowledgeStore } from "@voice-agent/rag";

// Retrieval metrics for the knowledge base: for questions whose right passage is known, how
// often is it the first result (recall@1), in the top 3 (recall@3), and how high on average
// (MRR, the mean of 1 / rank).

export interface RetrievalQuestion {
  question: string;
  /** Text that appears in the right passage (its heading or content), e.g. "free parking". */
  expected: string;
}

export interface RetrievalReport {
  questions: number;
  recallAt1: number;
  recallAt3: number;
  mrr: number;
  /** Questions whose right passage wasn't in the top 3. */
  misses: { question: string; got: string[] }[];
  latencyMs: number;
}

export async function evaluateRetrieval(
  store: Pick<KnowledgeStore, "keywordSearch" | "vectorSearch">,
  questions: RetrievalQuestion[],
  options: {
    mode: "hybrid" | "vector" | "keyword";
    embedding: EmbeddingProvider | null;
    rerankWith?: LanguageModelProvider | null;
  },
): Promise<RetrievalReport> {
  const started = performance.now();
  let first = 0;
  let top3 = 0;
  let reciprocal = 0;
  const misses: RetrievalReport["misses"] = [];
  for (const { question, expected } of questions) {
    const outcome = await searchKnowledge(store, {
      query: question,
      mode: options.mode,
      limit: 5,
      embedding: options.embedding,
      rerankWith: options.rerankWith ?? null,
    });
    const texts = outcome.results.map((hit) => `${hit.heading ?? ""} ${hit.content}`);
    const rank = texts.findIndex((text) => text.toLowerCase().includes(expected.toLowerCase())) + 1;
    if (rank === 1) first++;
    if (rank >= 1 && rank <= 3) top3++;
    if (rank >= 1) reciprocal += 1 / rank;
    if (rank === 0 || rank > 3) {
      misses.push({
        question,
        got: outcome.results.slice(0, 3).map((hit) => hit.heading ?? hit.documentTitle),
      });
    }
  }
  const n = questions.length || 1;
  const round = (value: number) => Math.round((value / n) * 100) / 100;
  return {
    questions: questions.length,
    recallAt1: round(first),
    recallAt3: round(top3),
    mrr: round(reciprocal),
    misses,
    latencyMs: Math.round(performance.now() - started),
  };
}

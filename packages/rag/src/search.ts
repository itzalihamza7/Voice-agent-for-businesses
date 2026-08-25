import type { EmbeddingProvider, LanguageModelProvider } from "@voice-agent/pipeline";
import type { LlmCallInfo } from "@voice-agent/shared";
import { z } from "zod";
import type { KnowledgeStore } from "./store";
import type { KnowledgeHit } from "./types";

// Searching the knowledge base. Two ways to find chunks, plus two optional AI steps:
//   - keyword: shares words with the query (exact terms, names, prices)
//   - vector:  close in meaning (different words, same idea)
//   - hybrid:  both, merged with Reciprocal Rank Fusion
//   - query rewriting (AI): turns "uh, how much is it to get my hair done" into a search query
//   - reranking (AI): reads the candidates and orders them by how well they answer the question

export type SearchMode = "hybrid" | "vector" | "keyword";

export interface SearchOptions {
  query: string;
  mode: SearchMode;
  limit: number;
  embedding: EmbeddingProvider | null;
  /** Model that rewrites the query first. null = search with the query as it is. */
  rewriteWith?: LanguageModelProvider | null;
  /** Model that reranks the candidates. null = keep the search order. */
  rerankWith?: LanguageModelProvider | null;
  /**
   * With reranking: drop results rated below this (0–10). Embedding similarity can't tell an
   * answerable question from an unanswerable one (the score ranges overlap); the reranker can.
   * Without results, the AI is told nothing was found instead of being handed unrelated text.
   */
  minRelevance?: number;
  /** Extra context for rewriting, e.g. the step's topic. */
  context?: string;
}

export interface SearchOutcome {
  query: string;
  searchQuery: string;
  keyword: KnowledgeHit[];
  vector: KnowledgeHit[];
  /** The final list, best first. */
  results: KnowledgeHit[];
  latencyMs: number;
  embeddingCostUsd: number | null;
  /** Model calls for rewriting and reranking, in order. */
  llm: LlmCallInfo[];
}

/** How many candidates each method finds before fusing. */
const CANDIDATES = 10;
/** How many of the fused results the AI rates (at least `limit`). */
const RERANK_CANDIDATES = 6;
/** In testing, answerable questions scored 10 and unanswerable ones mostly 0–2 (once 7). */
const DEFAULT_MIN_RELEVANCE = 5;

export async function searchKnowledge(
  store: Pick<KnowledgeStore, "keywordSearch" | "vectorSearch">,
  options: SearchOptions,
): Promise<SearchOutcome> {
  const started = performance.now();
  const llm: LlmCallInfo[] = [];
  let searchQuery = options.query;

  if (options.rewriteWith) {
    const rewritten = await rewriteQuery(options.rewriteWith, options.query, options.context);
    llm.push(rewritten.llm);
    if (rewritten.query) searchQuery = rewritten.query;
  }

  const wantVector = options.mode !== "keyword" && options.embedding !== null;
  const wantKeyword = options.mode !== "vector";
  let embeddingCostUsd: number | null = 0;
  const [keyword, vector] = await Promise.all([
    wantKeyword ? store.keywordSearch(searchQuery, CANDIDATES) : Promise.resolve([]),
    wantVector
      ? options.embedding!.embed([searchQuery], "query").then((embedded) => {
          embeddingCostUsd = embedded.costUsd;
          return store.vectorSearch(options.embedding!.id, embedded.vectors[0]!, CANDIDATES);
        })
      : Promise.resolve([]),
  ]);

  let results =
    options.mode === "keyword"
      ? keyword
      : options.mode === "vector"
        ? vector
        : reciprocalRankFusion([keyword, vector]);
  if (options.rerankWith && results.length > 1) {
    // Rerank only the top few: given 10 passages, llama3.1:8b rated every one 0 (even the exact
    // answer); with up to 8 it rated correctly. Long lists are hard for small models.
    const candidates = results.slice(0, Math.max(RERANK_CANDIDATES, options.limit));
    const reranked = await rerank(options.rerankWith, options.query, candidates);
    llm.push(reranked.llm);
    // Only filter when the reranker answered: a failed rerank keeps the fused order (and its
    // fusion scores, which are far below any relevance threshold).
    if (reranked.rated) {
      const minimum = options.minRelevance ?? DEFAULT_MIN_RELEVANCE;
      results = reranked.results.filter((hit) => hit.score >= minimum);
    } else {
      results = reranked.results;
    }
  }

  return {
    query: options.query,
    searchQuery,
    keyword,
    vector,
    results: results.slice(0, options.limit),
    latencyMs: Math.round(performance.now() - started),
    embeddingCostUsd,
    llm,
  };
}

/**
 * Reciprocal Rank Fusion: each list votes 1 / (k + rank) for its items. Scores from different
 * methods aren't comparable (cosine similarity vs. ts_rank), but ranks are. k = 60 is the usual
 * constant; it keeps one list's top item from dominating.
 */
export function reciprocalRankFusion(lists: KnowledgeHit[][], k = 60): KnowledgeHit[] {
  const fused = new Map<string, KnowledgeHit>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const existing = fused.get(hit.chunkId);
      const vote = 1 / (k + rank + 1);
      fused.set(hit.chunkId, { ...hit, score: (existing?.score ?? 0) + vote });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score);
}

const RewriteSchema = z.object({ query: z.string() });

async function rewriteQuery(llm: LanguageModelProvider, question: string, context?: string) {
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          "Rewrite what a phone caller said as a short search query for a business's knowledge base",
          "(FAQs, prices, opening hours, services, policies). Keep the important words, drop filler",
          "and greetings, and add one or two likely synonyms (e.g. 'cost' → 'price').",
          'Answer with JSON: { "query": "..." }',
        ].join("\n"),
      },
      {
        role: "user",
        content: context
          ? `Topic: ${context}\nCaller said: ${question}`
          : `Caller said: ${question}`,
      },
    ],
    {
      temperature: 0,
      jsonSchema: {
        name: "search_query",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: { query: { type: "string" } },
        },
      },
    },
  );
  const parsed = RewriteSchema.safeParse(safeJson(result.text));
  return { query: parsed.success ? parsed.data.query.trim() : "", llm: info(result) };
}

const RerankSchema = z.object({
  scores: z.array(z.object({ id: z.number().int(), relevance: z.number() })),
});

async function rerank(llm: LanguageModelProvider, question: string, hits: KnowledgeHit[]) {
  const passages = hits
    .map(
      (hit, i) => `[${i + 1}] ${hit.heading ? `${hit.heading}: ` : ""}${hit.content.slice(0, 600)}`,
    )
    .join("\n\n");
  const result = await llm.complete(
    [
      {
        role: "system",
        content: [
          "Rate how well each passage helps answer the caller's question, from 0 (not at all) to 10",
          "(answers it directly). Rate every passage.",
          'Answer with JSON: { "scores": [{ "id": 1, "relevance": 7 }, ...] }',
        ].join("\n"),
      },
      { role: "user", content: `Question: ${question}\n\nPassages:\n${passages}` },
    ],
    {
      temperature: 0,
      jsonSchema: {
        name: "rerank",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["scores"],
          properties: {
            scores: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "relevance"],
                properties: { id: { type: "integer" }, relevance: { type: "number" } },
              },
            },
          },
        },
      },
    },
  );
  const parsed = RerankSchema.safeParse(safeJson(result.text));
  if (!parsed.success || parsed.data.scores.length === 0) {
    return { results: hits, llm: info(result), rated: false };
  }
  // Unrated passages keep their place behind the rated ones.
  const relevance = new Map(parsed.data.scores.map((s) => [s.id, s.relevance]));
  const results = hits
    .map((hit, i) => ({ hit, relevance: relevance.get(i + 1) ?? -1, i }))
    .sort((a, b) => b.relevance - a.relevance || a.i - b.i)
    .map(({ hit, relevance: r }) => ({ ...hit, score: r }));
  return { results, llm: info(result), rated: true };
}

function info(result: Awaited<ReturnType<LanguageModelProvider["complete"]>>): LlmCallInfo {
  return {
    model: result.model,
    latencyMs: result.latencyMs,
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    cachedInputTokens: result.usage?.cachedInputTokens ?? null,
    costUsd: result.costUsd,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

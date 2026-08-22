import { z } from "zod";
import { LanguageModelError } from "../llm/types";
import type { EmbeddingProvider, EmbeddingPurpose, EmbeddingResult } from "./types";

// Embeddings through the OpenAI-compatible /embeddings endpoint, which OpenAI and Ollama share.

export interface OpenAICompatibleEmbeddingConfig {
  /** e.g. "ollama/nomic-embed-text". */
  id: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  /**
   * Text put in front of each input. nomic-embed-text, for example, was trained with
   * "search_query: " for questions and "search_document: " for documents; leaving them out
   * makes its search results worse.
   */
  prefixes?: Partial<Record<EmbeddingPurpose, string>>;
  /** US dollars per 1M input tokens. Undefined = unknown. */
  pricePerMillionTokens?: number;
  /** Inputs per request. */
  batchSize?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const ResponseSchema = z.object({
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish(),
});

export class OpenAICompatibleEmbeddings implements EmbeddingProvider {
  readonly id: string;

  constructor(private readonly config: OpenAICompatibleEmbeddingConfig) {
    this.id = config.id;
  }

  async embed(texts: string[], purpose: EmbeddingPurpose): Promise<EmbeddingResult> {
    const { baseUrl, model, apiKey, prefixes, batchSize = 64, timeoutMs = 60_000 } = this.config;
    const prefix = prefixes?.[purpose] ?? "";
    const started = performance.now();
    const vectors: number[][] = [];
    let tokens: number | null = 0;

    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize).map((text) => prefix + text);
      const response = await (this.config.fetch ?? fetch)(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, input: batch }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new LanguageModelError(
          `${this.id} embeddings failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
        );
      }
      const parsed = ResponseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new LanguageModelError(`${this.id}: unexpected embeddings response`);
      // The API may return items in any order: put them back by index.
      const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);
      vectors.push(...ordered.map((item) => item.embedding));
      tokens =
        parsed.data.usage && tokens !== null ? tokens + parsed.data.usage.prompt_tokens : null;
    }

    const price = this.config.pricePerMillionTokens;
    return {
      vectors,
      model: this.id,
      latencyMs: Math.round(performance.now() - started),
      tokens,
      costUsd: price === undefined || tokens === null ? null : (tokens * price) / 1_000_000,
    };
  }
}

/** Cosine similarity: 1 = same direction (same meaning), 0 = unrelated. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

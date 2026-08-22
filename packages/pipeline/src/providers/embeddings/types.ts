// Embeddings: turn text into vectors (lists of numbers) whose distance reflects meaning, so a
// question can find document passages about the same thing even with different words.

/** Questions and documents can be embedded differently (some models expect a prefix for each). */
export type EmbeddingPurpose = "query" | "document";

export interface EmbeddingResult {
  vectors: number[][];
  /** e.g. "ollama/nomic-embed-text": the key the vectors are stored under. */
  model: string;
  latencyMs: number;
  tokens: number | null;
  /** US dollars. 0 for local models, null if unknown. */
  costUsd: number | null;
}

export interface EmbeddingProvider {
  /** Stable id, e.g. "openai/text-embedding-3-small". Vectors from different models don't mix. */
  readonly id: string;
  embed(texts: string[], purpose: EmbeddingPurpose): Promise<EmbeddingResult>;
}

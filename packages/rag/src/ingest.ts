import type { EmbeddingProvider } from "@voice-agent/pipeline";
import {
  fixedChunks,
  headingChunks,
  semanticChunks,
  type Chunk,
  type ChunkingStrategy,
} from "./chunking";

// Turning a document's text into chunks and embeddings, ready to store.

export async function chunkText(
  text: string,
  strategy: ChunkingStrategy,
  /** Needed for the semantic strategy (it compares sentence meanings). */
  embedding: EmbeddingProvider | null,
): Promise<Chunk[]> {
  switch (strategy) {
    case "fixed":
      return fixedChunks(text);
    case "headings":
      return headingChunks(text);
    case "semantic":
      if (!embedding) throw new Error("Semantic chunking needs an embedding model.");
      return semanticChunks(
        text,
        async (sentences) => (await embedding.embed(sentences, "document")).vectors,
      );
  }
}

/** What a chunk is embedded as: its heading gives the content context ("Prices: £30"). */
export function embeddingText(chunk: Chunk): string {
  return chunk.heading ? `${chunk.heading}\n${chunk.content}` : chunk.content;
}

export interface EmbeddingStats {
  model: string;
  latencyMs: number;
  tokens: number | null;
  costUsd: number | null;
}

/** Embeds every chunk with every model. Returns the vectors per model and what it cost. */
export async function embedChunks(chunks: Chunk[], models: EmbeddingProvider[]) {
  const embeddings: Record<string, number[][]> = {};
  const stats: EmbeddingStats[] = [];
  for (const model of models) {
    const result = await model.embed(chunks.map(embeddingText), "document");
    embeddings[model.id] = result.vectors;
    stats.push({
      model: model.id,
      latencyMs: result.latencyMs,
      tokens: result.tokens,
      costUsd: result.costUsd,
    });
  }
  return { embeddings, stats };
}

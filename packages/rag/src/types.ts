// A search result: one chunk of a knowledge document.
export interface KnowledgeHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  content: string;
  /** Higher is better. Its scale depends on how it was found (vector, keyword, fused, reranked). */
  score: number;
}

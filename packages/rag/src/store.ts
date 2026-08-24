import { type PrismaClient } from "@voice-agent/db";
import type { Chunk } from "./chunking";
import type { KnowledgeHit } from "./types";

// Knowledge base storage in PostgreSQL. One instance serves one business: every query is
// filtered by businessId, so one business never sees another's documents.
// Prisma can't express pgvector or full-text search, so those queries are raw SQL.

export interface NewDocument {
  title: string;
  sourceType: "text" | "url" | "pdf";
  sourceUrl?: string;
  chunking: string;
  content: string;
  chunks: Chunk[];
  /** Vectors for every chunk, per embedding model id (same order as `chunks`). */
  embeddings: Record<string, number[][]>;
}

export interface DocumentSummary {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  chunking: string;
  createdAt: string;
  chunkCount: number;
  models: string[];
}

interface HitRow {
  chunk_id: string;
  document_id: string;
  title: string;
  heading: string | null;
  content: string;
  score: number;
}

// pgvector reads vectors written as "[1,2,3]".
const vectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
// The same expression must be used for searching and ranking.
const DOCUMENT_TEXT = `coalesce(c.heading, '') || ' ' || c.content`;

export class KnowledgeStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly businessId: string,
  ) {}

  async addDocument(input: NewDocument): Promise<{ id: string; chunkCount: number }> {
    for (const [model, vectors] of Object.entries(input.embeddings)) {
      if (vectors.length !== input.chunks.length) {
        throw new Error(`${model}: ${vectors.length} vectors for ${input.chunks.length} chunks.`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.knowledgeDocument.create({
        data: {
          businessId: this.businessId,
          title: input.title,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl ?? null,
          chunking: input.chunking,
          content: input.content,
        },
      });
      const chunkIds = input.chunks.map(() => crypto.randomUUID());
      await tx.knowledgeChunk.createMany({
        data: input.chunks.map((chunk, position) => ({
          id: chunkIds[position]!,
          documentId: document.id,
          businessId: this.businessId,
          position,
          heading: chunk.heading,
          content: chunk.content,
        })),
      });
      for (const [model, vectors] of Object.entries(input.embeddings)) {
        for (const [index, vector] of vectors.entries()) {
          await tx.$executeRaw`
            INSERT INTO knowledge_embeddings (chunk_id, model, embedding)
            VALUES (${chunkIds[index]}, ${model}, ${vectorLiteral(vector)}::vector)`;
        }
      }
      return { id: document.id, chunkCount: chunkIds.length };
    });
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const documents = await this.prisma.knowledgeDocument.findMany({
      where: { businessId: this.businessId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
    });
    const models = await this.prisma.$queryRaw<{ document_id: string; model: string }[]>`
      SELECT DISTINCT c.document_id, e.model
      FROM knowledge_embeddings e JOIN knowledge_chunks c ON c.id = e.chunk_id
      WHERE c.business_id = ${this.businessId}`;
    return documents.map((d) => ({
      id: d.id,
      title: d.title,
      sourceType: d.sourceType,
      sourceUrl: d.sourceUrl,
      chunking: d.chunking,
      createdAt: d.createdAt.toISOString(),
      chunkCount: d._count.chunks,
      models: models
        .filter((m) => m.document_id === d.id)
        .map((m) => m.model)
        .sort(),
    }));
  }

  async getChunks(documentId: string) {
    return this.prisma.knowledgeChunk.findMany({
      where: { documentId, businessId: this.businessId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, heading: true, content: true },
    });
  }

  /** Returns false if there is no such document for this business. */
  async deleteDocument(id: string): Promise<boolean> {
    const { count } = await this.prisma.knowledgeDocument.deleteMany({
      where: { id, businessId: this.businessId },
    });
    return count > 0;
  }

  /** Nearest chunks by meaning: cosine similarity of embeddings (1 = same direction). */
  async vectorSearch(model: string, queryVector: number[], limit: number): Promise<KnowledgeHit[]> {
    const rows = await this.prisma.$queryRaw<HitRow[]>`
      SELECT c.id AS chunk_id, c.document_id, d.title, c.heading, c.content,
             1 - (e.embedding <=> ${vectorLiteral(queryVector)}::vector) AS score
      FROM knowledge_embeddings e
      JOIN knowledge_chunks c ON c.id = e.chunk_id
      JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.business_id = ${this.businessId} AND e.model = ${model}
      ORDER BY e.embedding <=> ${vectorLiteral(queryVector)}::vector
      LIMIT ${limit}`;
    return rows.map(toHit);
  }

  /**
   * Chunks that share words with the query (Postgres full-text search, with English stemming:
   * "booking" matches "book"). The words are OR-ed, not AND-ed: a spoken question has many
   * words, and requiring all of them would usually find nothing. ts_rank orders by how well
   * each chunk matches.
   */
  async keywordSearch(query: string, limit: number): Promise<KnowledgeHit[]> {
    const rows = await this.prisma.$queryRawUnsafe<HitRow[]>(
      `WITH q AS (
         SELECT NULLIF(replace(plainto_tsquery('english', $2)::text, '&', '|'), '')::tsquery AS query
       )
       SELECT c.id AS chunk_id, c.document_id, d.title, c.heading, c.content,
              ts_rank(to_tsvector('english', ${DOCUMENT_TEXT}), q.query) AS score
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id, q
       WHERE c.business_id = $1 AND q.query IS NOT NULL
         AND to_tsvector('english', ${DOCUMENT_TEXT}) @@ q.query
       ORDER BY score DESC
       LIMIT $3`,
      this.businessId,
      query,
      limit,
    );
    return rows.map(toHit);
  }
}

function toHit(row: HitRow): KnowledgeHit {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.title,
    heading: row.heading,
    content: row.content,
    score: Number(row.score),
  };
}

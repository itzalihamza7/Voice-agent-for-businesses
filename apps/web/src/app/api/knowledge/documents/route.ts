// GET /api/knowledge/documents: the business's knowledge documents.
// POST /api/knowledge/documents { title, sourceType, sourceUrl?, text, chunking }: chunk the text,
// embed every chunk with every configured embedding model, and store it.
import { CHUNKING_STRATEGIES, chunkText, embedChunks } from "@voice-agent/rag";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { defaultEmbeddingModel, embeddingModels, getKnowledgeStore } from "@/server/knowledge";

const NewDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sourceType: z.enum(["text", "url", "pdf"]),
  sourceUrl: z.url().optional(),
  text: z.string().trim().min(1).max(500_000),
  chunking: z.enum(CHUNKING_STRATEGIES),
});

export async function GET() {
  return Response.json({ documents: await (await getKnowledgeStore()).listDocuments() });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, NewDocumentSchema);
  if ("response" in parsed) return parsed.response;
  const { text, chunking, ...document } = parsed.data;

  try {
    const chunks = await chunkText(text, chunking, defaultEmbeddingModel());
    if (chunks.length === 0) return Response.json({ error: "No text to store." }, { status: 400 });
    const { embeddings, stats } = await embedChunks(chunks, embeddingModels());
    const saved = await (
      await getKnowledgeStore()
    ).addDocument({
      ...document,
      chunking,
      content: text,
      chunks,
      embeddings,
    });
    return Response.json({ document: saved, embedding: stats }, { status: 201 });
  } catch (error) {
    // Usually an embedding model that isn't reachable (Ollama not running, no API key).
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

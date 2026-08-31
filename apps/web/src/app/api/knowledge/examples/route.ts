// POST /api/knowledge/examples: adds the example documents that aren't in the knowledge base yet.
import { addExampleDocuments } from "@voice-agent/rag";
import { embeddingModels, getKnowledgeStore } from "@/server/knowledge";

export async function POST() {
  try {
    return Response.json(await addExampleDocuments(getKnowledgeStore(), embeddingModels()));
  } catch (error) {
    // Usually an embedding model that isn't reachable (Ollama not running, no API key).
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

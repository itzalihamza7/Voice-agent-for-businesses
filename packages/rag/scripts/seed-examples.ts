import { createPrismaClient, DEFAULT_BUSINESS_ID } from "@voice-agent/db";
import { configuredEmbeddingModels, createEmbeddingModel } from "@voice-agent/pipeline";
import { addExampleDocuments } from "../src/examples";
import { KnowledgeStore } from "../src/store";

// Fills an empty demo knowledge base with the example documents. Runs on every `ddev start`,
// but only does something while the knowledge base is empty, so deleted examples stay deleted.
// It never fails the start: without a reachable embedding model it explains and stops.

async function main() {
  const prisma = createPrismaClient();
  try {
    const store = new KnowledgeStore(prisma, DEFAULT_BUSINESS_ID);
    if ((await store.listDocuments()).length > 0) {
      console.log("Knowledge seed: the knowledge base already has documents.");
      return;
    }
    const models = configuredEmbeddingModels().map((id) => createEmbeddingModel(id));
    const result = await addExampleDocuments(store, models);
    console.log(`Knowledge seed: added ${result.added.length} example documents.`);
  } catch (error) {
    console.warn(
      `Knowledge seed skipped: ${error instanceof Error ? error.message : String(error)}\n` +
        'Start Ollama (and check OPENAI_API_KEY), then use "Add example documents" on the knowledge base page.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();

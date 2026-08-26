// GET /api/knowledge/models: the configured embedding models (the first is used in calls).
import { configuredEmbeddingModels } from "@voice-agent/pipeline";

export function GET() {
  return Response.json({ models: configuredEmbeddingModels() });
}

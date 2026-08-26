// POST /api/knowledge/preview { text, chunking }: how the text would be split, without storing it.
import { CHUNKING_STRATEGIES, chunkText } from "@voice-agent/rag";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { defaultEmbeddingModel } from "@/server/knowledge";

const PreviewSchema = z.object({
  text: z.string().trim().min(1).max(500_000),
  chunking: z.enum(CHUNKING_STRATEGIES),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, PreviewSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const chunks = await chunkText(parsed.data.text, parsed.data.chunking, defaultEmbeddingModel());
    return Response.json({ chunks });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

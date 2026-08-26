// GET /api/knowledge/documents/:documentId/chunks: how the document was split.
import { getKnowledgeStore } from "@/server/knowledge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  return Response.json({ chunks: await getKnowledgeStore().getChunks(documentId) });
}

// DELETE /api/knowledge/documents/:documentId: removes the document with its chunks and embeddings.
import { getKnowledgeStore } from "@/server/knowledge";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const deleted = await getKnowledgeStore().deleteDocument(documentId);
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Document not found" }, { status: 404 });
}

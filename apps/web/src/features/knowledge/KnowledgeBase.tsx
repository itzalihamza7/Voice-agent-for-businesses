"use client";

import { useState } from "react";
import { AddDocument } from "./AddDocument";
import { SearchPlayground } from "./SearchPlayground";

// Two columns: the documents (and adding new ones) on the left, the search playground on the right.

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

export function KnowledgeBase({ initialDocuments }: { initialDocuments: DocumentSummary[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [openChunks, setOpenChunks] = useState<
    Record<string, { heading: string | null; content: string }[]>
  >({});

  async function refresh() {
    const response = await fetch("/api/knowledge/documents");
    setDocuments(((await response.json()) as { documents: DocumentSummary[] }).documents);
  }

  async function toggleChunks(id: string) {
    if (openChunks[id]) {
      const { [id]: _closed, ...rest } = openChunks;
      setOpenChunks(rest);
      return;
    }
    const response = await fetch(`/api/knowledge/documents/${id}/chunks`);
    const { chunks } = (await response.json()) as {
      chunks: { heading: string | null; content: string }[];
    };
    setOpenChunks({ ...openChunks, [id]: chunks });
  }

  const [examples, setExamples] = useState<{ busy?: boolean; message?: string; error?: string }>(
    {},
  );

  async function addExamples() {
    setExamples({ busy: true });
    const response = await fetch("/api/knowledge/examples", { method: "POST" });
    const body = (await response.json()) as { added?: string[]; error?: string };
    if (!response.ok) {
      setExamples({ error: body.error ?? `HTTP ${response.status}` });
      return;
    }
    const added = body.added ?? [];
    setExamples({
      message: added.length
        ? `Added ${added.join(", ")}.`
        : "The example documents are already there.",
    });
    await refresh();
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}" and its chunks?`)) return;
    await fetch(`/api/knowledge/documents/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-slate-200">
      <section className="space-y-6 overflow-y-auto p-6">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Documents</h2>
            <button
              type="button"
              onClick={addExamples}
              disabled={examples.busy}
              className="text-xs text-brand-600 font-medium hover:underline disabled:opacity-40"
              title="A hair salon's FAQ, price list, policies and about page, for trying things out"
            >
              {examples.busy ? "Adding examples…" : "Add example documents"}
            </button>
          </div>
          {examples.message && (
            <p className="mt-1 text-xs text-emerald-700" data-testid="examples-message">
              {examples.message}
            </p>
          )}
          {examples.error && <p className="mt-1 text-xs text-red-600">{examples.error}</p>}
          {documents.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No documents yet. Add your FAQ, price list or website below.
            </p>
          ) : (
            <ul className="mt-2 space-y-2" data-testid="documents">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-lg border border-slate-200 p-3 text-sm"
                  data-testid="document"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{doc.title}</span>
                    <span className="flex gap-3 text-xs">
                      <button
                        type="button"
                        className="text-brand-600 font-medium hover:underline"
                        onClick={() => toggleChunks(doc.id)}
                      >
                        {openChunks[doc.id] ? "Hide chunks" : "Chunks"}
                      </button>
                      <button
                        type="button"
                        className="text-red-600 underline"
                        onClick={() => remove(doc.id, doc.title)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {doc.sourceType}
                    {doc.sourceUrl ? ` · ${doc.sourceUrl}` : ""} · {doc.chunkCount} chunks (
                    {doc.chunking}) · embedded with {doc.models.join(", ")}
                  </p>
                  {openChunks[doc.id] && <ChunkList chunks={openChunks[doc.id]!} />}
                </li>
              ))}
            </ul>
          )}
        </div>
        <AddDocument onAdded={refresh} />
      </section>
      <SearchPlayground />
    </div>
  );
}

export function ChunkList({ chunks }: { chunks: { heading: string | null; content: string }[] }) {
  return (
    <ol className="mt-2 max-h-80 space-y-1 overflow-y-auto" data-testid="chunk-list">
      {chunks.map((chunk, i) => (
        <li key={i} className="rounded-lg bg-slate-50 p-2 text-xs">
          <span className="text-slate-400">
            #{i + 1} · {chunk.content.length} chars
          </span>
          {chunk.heading && <span className="ml-1 font-semibold">{chunk.heading}</span>}
          <p className="whitespace-pre-wrap">{chunk.content}</p>
        </li>
      ))}
    </ol>
  );
}

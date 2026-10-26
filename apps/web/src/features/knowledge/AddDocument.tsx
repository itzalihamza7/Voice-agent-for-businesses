"use client";

import { useState } from "react";
import { formatCost } from "../builder/LlmMeta";
import { ChunkList } from "./KnowledgeBase";

// Adding a document: paste text, fetch a web page or upload a PDF, choose how to split it,
// preview the chunks, then save (which embeds every chunk with every embedding model).

type Source = "text" | "url" | "pdf";
type Chunking = "headings" | "fixed" | "semantic";

const CHUNKING_HELP: Record<Chunking, string> = {
  headings:
    "One chunk per section (# headings or FAQ questions). Best for FAQs and structured pages.",
  fixed: "Every ~800 characters, overlapping. Works for anything, but can mix topics.",
  semantic: "New chunk where the meaning changes (compares sentence embeddings). For long prose.",
};

export function AddDocument({ onAdded }: { onAdded: () => Promise<void> }) {
  const [source, setSource] = useState<Source>("text");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [chunking, setChunking] = useState<Chunking>("headings");
  const [preview, setPreview] = useState<{ heading: string | null; content: string }[] | null>(
    null,
  );
  const [status, setStatus] = useState<{ busy?: string; error?: string; done?: string }>({});

  async function call(path: string, init: RequestInit, busy: string) {
    setStatus({ busy });
    const response = await fetch(path, init);
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      setStatus({ error: String(body.error ?? `HTTP ${response.status}`) });
      return null;
    }
    setStatus({});
    return body;
  }

  async function fetchPage() {
    const body = await call(
      "/api/knowledge/extract",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      },
      "Fetching the page…",
    );
    if (body) {
      setText(String(body.text));
      if (!title) setTitle(String(body.title));
      setPreview(null);
    }
  }

  async function uploadPdf(file: File) {
    const form = new FormData();
    form.append("file", file);
    const body = await call(
      "/api/knowledge/extract",
      { method: "POST", body: form },
      "Reading the PDF…",
    );
    if (body) {
      setText(String(body.text));
      if (!title) setTitle(String(body.title));
      setPreview(null);
    }
  }

  async function showPreview() {
    const body = await call(
      "/api/knowledge/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, chunking }),
      },
      "Splitting…",
    );
    if (body) setPreview(body.chunks as { heading: string | null; content: string }[]);
  }

  async function save() {
    const body = await call(
      "/api/knowledge/documents",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          sourceType: source,
          ...(source === "url" ? { sourceUrl: url } : {}),
          text,
          chunking,
        }),
      },
      "Embedding and saving…",
    );
    if (!body) return;
    const stats = (body.embedding as { model: string; latencyMs: number; costUsd: number | null }[])
      .map(
        (s) =>
          `${s.model} ${(s.latencyMs / 1000).toFixed(1)} s${s.costUsd ? ` ${formatCost(s.costUsd)}` : ""}`,
      )
      .join(" · ");
    const { chunkCount } = body.document as { chunkCount: number };
    setStatus({ done: `Saved ${chunkCount} chunks. Embedded with ${stats}.` });
    setText("");
    setTitle("");
    setUrl("");
    setPreview(null);
    await onAdded();
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4" data-testid="add-document">
      <h2 className="font-semibold">Add a document</h2>
      <div
        className="flex overflow-hidden rounded-lg border border-slate-300 text-sm"
        role="tablist"
      >
        {(["text", "url", "pdf"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={source === tab}
            onClick={() => setSource(tab)}
            className={`flex-1 px-3 py-1 ${source === tab ? "bg-ink text-white" : "hover:bg-slate-100"}`}
          >
            {{ text: "Paste text", url: "Web page", pdf: "PDF" }[tab]}
          </button>
        ))}
      </div>
      {source === "url" && (
        <div className="flex gap-2">
          <input
            aria-label="Page URL"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            placeholder="https://your-business.com/faq"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={fetchPage}
            disabled={!url}
            className="rounded-lg border border-slate-300 px-3 text-sm"
          >
            Fetch
          </button>
        </div>
      )}
      {source === "pdf" && (
        <input
          aria-label="PDF file"
          type="file"
          accept="application/pdf"
          className="text-sm"
          onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])}
        />
      )}
      <input
        aria-label="Document title"
        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
        placeholder="Title, e.g. FAQ"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        aria-label="Document text"
        className="w-full rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs"
        rows={8}
        placeholder={"# Prices\nA haircut costs £30.\n\n# Opening hours\n…"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
      />
      <label className="block text-sm">
        <span className="font-medium">Split into chunks by</span>
        <select
          aria-label="Chunking"
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1"
          value={chunking}
          onChange={(e) => {
            setChunking(e.target.value as Chunking);
            setPreview(null);
          }}
        >
          <option value="headings">Headings / questions</option>
          <option value="fixed">Fixed size</option>
          <option value="semantic">Meaning (semantic)</option>
        </select>
        <span className="mt-1 block text-xs text-slate-500">{CHUNKING_HELP[chunking]}</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={showPreview}
          disabled={!text.trim()}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          Preview chunks
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim() || !title.trim() || Boolean(status.busy)}
          className="rounded-lg bg-brand-600 px-3 py-1 text-sm text-white disabled:opacity-40"
        >
          Save to knowledge base
        </button>
      </div>
      {status.busy && <p className="text-sm text-slate-500">{status.busy}</p>}
      {status.error && (
        <p className="text-sm text-red-600" data-testid="add-error">
          {status.error}
        </p>
      )}
      {status.done && (
        <p className="text-sm text-emerald-700" data-testid="add-done">
          {status.done}
        </p>
      )}
      {preview && (
        <div>
          <p className="text-sm font-medium" data-testid="preview-count">
            {preview.length} chunks, {Math.min(...preview.map((c) => c.content.length))}–
            {Math.max(...preview.map((c) => c.content.length))} characters
          </p>
          <ChunkList chunks={preview} />
        </div>
      )}
    </div>
  );
}

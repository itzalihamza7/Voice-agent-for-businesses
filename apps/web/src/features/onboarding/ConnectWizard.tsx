"use client";

import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  Plug,
  Search,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

interface Scan {
  origin: string;
  pages: string[];
  detected: {
    how: "template" | "openapi";
    summary: string;
    connection: { name: string; actions: { name: string; description: string }[] };
  } | null;
}

interface Result {
  agentId: string;
  imported: number;
  failed: string[];
  tools: string[];
}

const readable = (name: string) => name.replace(/_/g, " ");

// Website address -> what we found -> a ready agent. Three steps, one page.
export function ConnectWizard({ businessName: initialName }: { businessName: string }) {
  const [url, setUrl] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [businessName, setBusinessName] = useState(initialName);
  const [transferNumber, setTransferNumber] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"scan" | "setup" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post<T>(path: string, body: unknown): Promise<T | null> {
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as T & {
      error?: string;
      issues?: { message: string }[];
    };
    if (!response.ok) {
      setError(json.issues?.[0]?.message ?? json.error ?? `HTTP ${response.status}`);
      return null;
    }
    return json;
  }

  async function runScan(event: FormEvent) {
    event.preventDefault();
    const address = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    setBusy("scan");
    setScan(null);
    setResult(null);
    const found = await post<Scan>("/api/onboarding/scan", { url: address });
    setBusy(null);
    if (!found) return;
    setUrl(address);
    setScan(found);
    setSelected(new Set(found.pages));
  }

  async function runSetup() {
    if (!scan) return;
    setBusy("setup");
    const done = await post<Result>("/api/onboarding/setup", {
      url,
      businessName: businessName.trim(),
      transferNumber: transferNumber.trim() || null,
      pages: scan.pages.filter((page) => selected.has(page)),
    });
    setBusy(null);
    if (done) setResult(done);
  }

  const toggle = (page: string) => {
    const next = new Set(selected);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    setSelected(next);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={runScan} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="site-url">
            Website address
          </label>
          <div className="relative">
            <Globe className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              id="site-url"
              className="input pl-9"
              placeholder="yourbusiness.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={busy !== null || !url.trim()}>
          {busy === "scan" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {busy === "scan" ? "Reading your site…" : "Scan website"}
        </button>
      </form>

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {scan && !result && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <FileText className="h-4 w-4 text-brand-600" /> Pages for the knowledge base
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selected.size} of {scan.pages.length} selected. The agent answers questions from
                these.
              </p>
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
                {scan.pages.map((page) => (
                  <li key={page}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="accent-brand-600"
                        checked={selected.has(page)}
                        onChange={() => toggle(page)}
                      />
                      <span className="truncate text-slate-700">
                        {new URL(page).pathname || "/"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <Plug className="h-4 w-4 text-brand-600" /> Your app
              </h2>
              {scan.detected ? (
                <>
                  <p className="mt-1 text-sm text-slate-500">{scan.detected.summary}</p>
                  <span className="badge mt-3 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {scan.detected.how === "template"
                      ? `${scan.detected.connection.name} detected`
                      : "OpenAPI document found"}
                  </span>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {scan.detected.connection.actions.map((action) => (
                      <li key={action.name} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="text-slate-700 capitalize">{readable(action.name)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  We didn&apos;t find an API we can use. The agent will answer questions from your
                  pages, and you can add your app later under{" "}
                  <Link href="/connections" className="text-brand-600 hover:underline">
                    App connections
                  </Link>
                  .
                </p>
              )}
            </section>
          </div>

          <section className="card space-y-4 p-5">
            <h2 className="font-semibold text-slate-900">Your agent</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="business-name">
                  Business name (what the agent says)
                </label>
                <input
                  id="business-name"
                  className="input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="transfer-number">
                  Number for &quot;speak to a person&quot; (optional)
                </label>
                <input
                  id="transfer-number"
                  className="input"
                  placeholder="+34600000000"
                  value={transferNumber}
                  onChange={(e) => setTransferNumber(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">Importing pages takes a few seconds each.</p>
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== null || !businessName.trim()}
                onClick={() => void runSetup()}
              >
                {busy === "setup" && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy === "setup" ? "Building your agent…" : "Create my agent"}
              </button>
            </div>
          </section>
        </>
      )}

      {result && (
        <section className="card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Your agent is ready</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {result.imported} page{result.imported === 1 ? "" : "s"} added to the knowledge base
            {result.tools.length > 0 && `, ${result.tools.length} actions connected from your app`}
            {result.failed.length > 0 && ` (${result.failed.length} couldn't be read)`}. Try it in
            the test chat, then publish it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/agents/${result.agentId}/builder`} className="btn-primary">
              Open the agent <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/knowledge" className="btn-secondary">
              See the knowledge base
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

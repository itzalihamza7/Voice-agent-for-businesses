"use client";

import type { ConnectionAction, ConnectionSummary } from "@voice-agent/shared";
import { KeyRound, Loader2, Pencil, Play, Plug, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/features/ui/PageHeader";

type Auth = ConnectionSummary["authType"];

interface Draft {
  id: string | null;
  name: string;
  slug: string;
  baseUrl: string;
  authType: Auth;
  authHeader: string;
  secret: string;
  hasSecret: boolean;
  actions: string;
}

const EXAMPLE_ACTIONS: ConnectionAction[] = [
  {
    name: "check_stock",
    description: "How many of a product are in stock, by its SKU.",
    method: "GET",
    path: "/products/{sku}/stock",
    parameters: [
      { name: "sku", in: "path", type: "string", required: true, description: "The product SKU." },
    ],
    fixedBody: {},
  },
];

const blank = (): Draft => ({
  id: null,
  name: "",
  slug: "",
  baseUrl: "https://",
  authType: "none",
  authHeader: "",
  secret: "",
  hasSecret: false,
  actions: JSON.stringify(EXAMPLE_ACTIONS, null, 2),
});

const fromSummary = (c: ConnectionSummary): Draft => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  baseUrl: c.baseUrl,
  authType: c.authType,
  authHeader: c.authHeader ?? "",
  secret: "",
  hasSecret: c.hasSecret,
  actions: JSON.stringify(c.actions, null, 2),
});

async function send(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
  if (!response.ok) {
    const issue = (
      json.issues as { path?: (string | number)[]; message: string }[] | undefined
    )?.[0];
    throw new Error(
      issue
        ? `${issue.path?.join(".") ?? ""}: ${issue.message}`
        : String(json.error ?? response.status),
    );
  }
  return json;
}

// Lists the business's connections; adds, edits, tests and removes them.
export function ConnectionsManager({ initial }: { initial: ConnectionSummary[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  if (draft) {
    return (
      <ConnectionForm
        draft={draft}
        onCancel={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          router.refresh();
        }}
      />
    );
  }

  async function remove(connection: ConnectionSummary) {
    if (!confirm(`Remove ${connection.name}? Agents that use its actions will lose them.`)) return;
    await send(`/api/connections/${connection.id}`, "DELETE");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {initial.length === 0 ? (
        <EmptyState
          icon={<Plug className="h-6 w-6" />}
          title="No apps connected yet"
          description="If your website has a booking system, setting up from your website connects it for you. Or add any API by hand."
          action={
            <div className="flex gap-2">
              <Link href="/connect" className="btn-primary">
                Set up from your website
              </Link>
              <button type="button" className="btn-secondary" onClick={() => setDraft(blank())}>
                Add an API by hand
              </button>
            </div>
          }
        />
      ) : (
        <>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setDraft(blank())}>
              <Plus className="h-4 w-4" /> Add connection
            </button>
          </div>
          {initial.map((connection) => (
            <section key={connection.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">{connection.name}</h2>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{connection.baseUrl}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="badge bg-brand-50 text-brand-700">
                      Tools: {connection.slug}_…
                    </span>
                    <span className="badge bg-slate-100 text-slate-600">
                      <KeyRound className="h-3 w-3" />
                      {connection.authType === "none"
                        ? "No key"
                        : connection.hasSecret
                          ? "Key saved"
                          : "Key missing"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setTesting(testing === connection.id ? null : connection.id)}
                  >
                    <Play className="h-4 w-4" /> Test
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setDraft(fromSummary(connection))}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-red-600 hover:bg-red-50"
                    onClick={() => void remove(connection)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {connection.actions.map((action) => (
                  <li key={action.name} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-[11px] font-semibold text-slate-500">
                        {action.method}
                      </span>
                      <span className="font-medium text-slate-800">{action.name}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {action.description}
                    </p>
                  </li>
                ))}
              </ul>
              {testing === connection.id && <TestPanel connection={connection} />}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ConnectionForm({
  draft: initial,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [spec, setSpec] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  async function importSpec() {
    setError(null);
    try {
      const { baseUrl, actions } = await send("/api/connections/openapi", "POST", {
        spec: JSON.parse(spec),
      });
      set({
        actions: JSON.stringify(actions, null, 2),
        ...(typeof baseUrl === "string" && baseUrl.startsWith("http") ? { baseUrl } : {}),
      });
      setSpec("");
    } catch (e) {
      setError(e instanceof SyntaxError ? "That isn't valid JSON." : String((e as Error).message));
    }
  }

  async function save() {
    setError(null);
    let actions: unknown;
    try {
      actions = JSON.parse(draft.actions);
    } catch {
      setError("The actions aren't valid JSON.");
      return;
    }
    setPending(true);
    try {
      await send(
        draft.id ? `/api/connections/${draft.id}` : "/api/connections",
        draft.id ? "PUT" : "POST",
        {
          name: draft.name,
          slug: draft.slug,
          baseUrl: draft.baseUrl,
          authType: draft.authType,
          authHeader: draft.authType === "header" ? draft.authHeader : null,
          secret: draft.secret || null,
          actions,
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card space-y-5 p-6">
      <h2 className="text-lg font-semibold text-slate-900">
        {draft.id ? `Edit ${initial.name}` : "Add a connection"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="c-name">
            Name
          </label>
          <input
            id="c-name"
            className="input"
            placeholder="Shop"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="c-slug">
            Short name (tool prefix)
          </label>
          <input
            id="c-slug"
            className="input font-mono"
            placeholder="shop"
            value={draft.slug}
            onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
          />
        </div>
        <div>
          <label className="label" htmlFor="c-base">
            API base URL
          </label>
          <input
            id="c-base"
            className="input font-mono"
            value={draft.baseUrl}
            onChange={(e) => set({ baseUrl: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="c-auth">
            Authentication
          </label>
          <select
            id="c-auth"
            className="input"
            value={draft.authType}
            onChange={(e) => set({ authType: e.target.value as Auth })}
          >
            <option value="none">None (public API)</option>
            <option value="bearer">Bearer token</option>
            <option value="header">API key header</option>
          </select>
        </div>
        {draft.authType === "header" && (
          <div>
            <label className="label" htmlFor="c-header">
              Header name
            </label>
            <input
              id="c-header"
              className="input font-mono"
              placeholder="x-api-key"
              value={draft.authHeader}
              onChange={(e) => set({ authHeader: e.target.value })}
            />
          </div>
        )}
        {draft.authType !== "none" && (
          <div>
            <label className="label" htmlFor="c-secret">
              Key or token
            </label>
            <input
              id="c-secret"
              type="password"
              autoComplete="off"
              className="input"
              placeholder={draft.hasSecret ? "Saved (leave empty to keep)" : ""}
              value={draft.secret}
              onChange={(e) => set({ secret: e.target.value })}
            />
          </div>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Import from an OpenAPI document
        </summary>
        <textarea
          aria-label="OpenAPI document"
          rows={5}
          className="input mt-3 font-mono text-xs"
          placeholder='{"openapi": "3.0.0", "paths": { ... }}'
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary mt-2"
          disabled={!spec.trim()}
          onClick={() => void importSpec()}
        >
          Import actions
        </button>
      </details>

      <div>
        <label className="label" htmlFor="c-actions">
          Actions (JSON)
        </label>
        <textarea
          id="c-actions"
          rows={14}
          className="input font-mono text-xs"
          value={draft.actions}
          onChange={(e) => set({ actions: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">
          Each action: name, description (the AI reads it), method, path with {"{placeholders}"},
          parameters (in path, query or body), and fixedBody for values the AI must not choose.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => void save()}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save connection
        </button>
      </div>
    </section>
  );
}

function TestPanel({ connection }: { connection: ConnectionSummary }) {
  const [action, setAction] = useState(connection.actions[0]?.name ?? "");
  const [args, setArgs] = useState("{}");
  const [output, setOutput] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const chosen = connection.actions.find((a) => a.name === action);

  async function run() {
    setPending(true);
    try {
      const { result, latencyMs } = await send(`/api/connections/${connection.id}/test`, "POST", {
        action,
        args: JSON.parse(args),
      });
      setOutput(`${String(latencyMs)} ms\n${JSON.stringify(result, null, 2)}`);
    } catch (e) {
      setOutput(
        e instanceof SyntaxError ? "The arguments aren't valid JSON." : (e as Error).message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4" data-testid="connection-test">
      <p className="text-xs text-slate-500">
        Runs the action for real against your app, exactly as an agent would. Actions that create or
        cancel something will do so.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Action"
          className="input w-auto"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {connection.actions.map((a) => (
            <option key={a.name} value={a.name}>
              {a.method} {a.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => void run()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run
        </button>
      </div>
      {chosen && chosen.parameters.length > 0 && (
        <p className="text-xs text-slate-500">
          Parameters:{" "}
          {chosen.parameters.map((p) => `${p.name}${p.required ? "" : "?"} (${p.type})`).join(", ")}
        </p>
      )}
      <textarea
        aria-label="Arguments"
        rows={3}
        className="input font-mono text-xs"
        value={args}
        onChange={(e) => setArgs(e.target.value)}
      />
      {output && (
        <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {output}
        </pre>
      )}
    </div>
  );
}

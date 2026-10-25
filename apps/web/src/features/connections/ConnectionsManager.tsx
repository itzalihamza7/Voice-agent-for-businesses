"use client";

import {
  changesData,
  VERIFICATION_FILE_PATH,
  VERIFICATION_TXT_PREFIX,
  type ConnectionAction,
  type ConnectionSummary,
} from "@voice-agent/shared";
import {
  Activity,
  BadgeCheck,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Phone,
  Play,
  Plug,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [open, setOpen] = useState<{ id: string; panel: Panel } | null>(null);
  const toggle = (id: string, panel: Panel) =>
    setOpen(open?.id === id && open.panel === panel ? null : { id, panel });

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
                    {connection.writesAllowed ? (
                      <span className="badge bg-emerald-50 text-emerald-700">
                        <BadgeCheck className="h-3 w-3" />
                        {connection.verifiedAt ? "Domain verified" : "Changes allowed by your key"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="badge bg-amber-50 text-amber-800 hover:bg-amber-100"
                        onClick={() => toggle(connection.id, "verify")}
                      >
                        <ShieldAlert className="h-3 w-3" /> Read-only until verified
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => toggle(connection.id, "test")}
                  >
                    <Play className="h-4 w-4" /> Test
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => toggle(connection.id, "activity")}
                  >
                    <Activity className="h-4 w-4" /> Activity
                  </button>
                  {!connection.verifiedAt && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => toggle(connection.id, "verify")}
                    >
                      <BadgeCheck className="h-4 w-4" /> Verify
                    </button>
                  )}
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
                      {changesData(action) && !connection.writesAllowed && (
                        <Lock
                          className="h-3.5 w-3.5 text-amber-600"
                          aria-label="Locked until the domain is verified"
                        />
                      )}
                      {action.parameters.some((p) => p.source === "caller_phone") && (
                        <Phone
                          className="h-3.5 w-3.5 text-brand-600"
                          aria-label="Uses the caller's number"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {action.description}
                    </p>
                  </li>
                ))}
              </ul>
              {open?.id === connection.id && open.panel === "test" && (
                <TestPanel connection={connection} />
              )}
              {open?.id === connection.id && open.panel === "verify" && (
                <VerifyPanel connection={connection} onVerified={() => router.refresh()} />
              )}
              {open?.id === connection.id && open.panel === "activity" && (
                <ActivityPanel connection={connection} />
              )}
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
          parameters (in path, query or body; add{" "}
          <code>&quot;source&quot;: &quot;caller_phone&quot;</code> for a value our code fills with
          the caller&apos;s number), fixedBody for values the AI must not choose, and{" "}
          <code>&quot;readOnly&quot;: true</code> for a POST that only reads.
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

type Panel = "test" | "verify" | "activity";

/** How to prove the business owns the API's domain, and the check. */
function VerifyPanel({
  connection,
  onVerified,
}: {
  connection: ConnectionSummary;
  onVerified: () => void;
}) {
  const host = new URL(connection.baseUrl).hostname;
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  async function check() {
    setPending(true);
    try {
      const out = (await send(`/api/connections/${connection.id}/verify`, "POST")) as {
        verified: boolean;
        method: string | null;
        checked: string[];
      };
      setResult(
        out.verified
          ? { ok: true, text: `Verified (${out.method === "dns" ? "DNS record" : "file"}).` }
          : { ok: false, text: `Not found yet. Checked: ${out.checked.join(", ")}.` },
      );
      if (out.verified) onVerified();
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="mt-4 space-y-3 rounded-lg bg-amber-50/60 p-4 text-sm"
      data-testid="verify-panel"
    >
      <p className="text-slate-700">
        Agents can read through this connection, but actions that change data (bookings,
        cancellations) need proof that the API is yours. Add its own API key, or do one of these on{" "}
        <strong>{host}</strong> (or its main domain). Your website itself doesn&apos;t change.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">A DNS TXT record</div>
          <code className="mt-2 block rounded bg-slate-100 px-2 py-1.5 text-xs break-all text-slate-800">
            {VERIFICATION_TXT_PREFIX}
            {connection.verificationToken}
          </code>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-900">Or a file</div>
          <code className="mt-2 block rounded bg-slate-100 px-2 py-1.5 text-xs break-all text-slate-800">
            https://{host}
            {VERIFICATION_FILE_PATH}
          </code>
          <p className="mt-1 text-xs text-slate-500">containing {connection.verificationToken}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => void check()}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Check now
        </button>
        {result && (
          <span className={result.ok ? "text-emerald-700" : "text-slate-600"}>{result.text}</span>
        )}
      </div>
    </div>
  );
}

interface RequestRow {
  id: string;
  callId: string | null;
  action: string;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  error: string | null;
  latencyMs: number;
  createdAt: string;
}

/** The audit log: every request agents made through the connection. */
function ActivityPanel({ connection }: { connection: ConnectionSummary }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/connections/${connection.id}/requests`)
      .then((r) => r.json() as Promise<{ requests: RequestRow[] }>)
      .then((data) => !cancelled && setRows(data.requests))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connection.id]);

  return (
    <div className="mt-4 rounded-lg border border-slate-200" data-testid="activity-panel">
      <div className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        Every request made with this connection: never the key or what was sent.
      </div>
      {rows === null ? (
        <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">No requests yet.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-800">{r.action}</td>
                  <td className="px-2 py-2 font-mono text-slate-500">
                    {r.method} {r.path}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`badge ${r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                      title={r.error ?? undefined}
                    >
                      {r.status ?? (r.ok ? "ok" : "refused")}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-slate-500 tabular-nums">
                    {r.latencyMs} ms
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.callId ? (
                      <span className="font-mono text-slate-400">call {r.callId.slice(0, 8)}</span>
                    ) : (
                      <span className="text-slate-400">test</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TestPanel({ connection }: { connection: ConnectionSummary }) {
  const [action, setAction] = useState(connection.actions[0]?.name ?? "");
  const [args, setArgs] = useState("{}");
  const [callerPhone, setCallerPhone] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const chosen = connection.actions.find((a) => a.name === action);

  async function run() {
    setPending(true);
    try {
      const { result, latencyMs } = await send(`/api/connections/${connection.id}/test`, "POST", {
        action,
        args: JSON.parse(args),
        ...(callerPhone.trim() ? { callerPhone: callerPhone.trim() } : {}),
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
          {chosen.parameters
            .filter((p) => p.source !== "caller_phone")
            .map((p) => `${p.name}${p.required ? "" : "?"} (${p.type})`)
            .join(", ")}
        </p>
      )}
      {chosen?.parameters.some((p) => p.source === "caller_phone") && (
        <input
          aria-label="Caller's number"
          className="input"
          placeholder="Caller's number for this test, e.g. +34600111222"
          value={callerPhone}
          onChange={(e) => setCallerPhone(e.target.value)}
        />
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

"use client";

import { KeyRound, Loader2, Timer } from "lucide-react";
import { useEffect, useState } from "react";

interface DataSettings {
  retentionDays: number | null;
  choices: number[];
  ownDataKey: boolean;
}

// Owners: how long call data is kept, and the business's own encryption key.
export function DataSecurityPanel() {
  const [settings, setSettings] = useState<DataSettings | null>(null);
  const [busy, setBusy] = useState<"retention" | "rotate" | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/business/data")
      .then((r) => r.json() as Promise<DataSettings>)
      .then((data) => !cancelled && setSettings(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveRetention(days: number | null) {
    if (!settings) return;
    if (
      days !== null &&
      !confirm(`Delete calls, caller memories and connection logs older than ${days} days now?`)
    )
      return;
    setBusy("retention");
    const response = await fetch("/api/business/data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ retentionDays: days }),
    });
    const out = (await response.json()) as {
      error?: string;
      deleted?: {
        calls: number;
        webChats: number;
        callerMemories: number;
        connectionRequests: number;
      } | null;
    };
    setBusy(null);
    if (!response.ok) return setMessage({ text: out.error ?? "Didn't work.", error: true });
    setSettings({ ...settings, retentionDays: days });
    const d = out.deleted;
    setMessage({
      text:
        d && d.calls + d.webChats + d.callerMemories + d.connectionRequests > 0
          ? `Saved. Deleted ${d.calls} calls, ${d.webChats} website chats, ${d.callerMemories} caller memories and ${d.connectionRequests} log entries.`
          : "Saved.",
    });
  }

  async function rotate() {
    if (!confirm("Create a new encryption key and re-encrypt all your stored keys with it?"))
      return;
    setBusy("rotate");
    const response = await fetch("/api/business/data/rotate-key", { method: "POST" });
    const out = (await response.json()) as { resealed?: number; error?: string };
    setBusy(null);
    if (!response.ok) return setMessage({ text: out.error ?? "Didn't work.", error: true });
    if (settings) setSettings({ ...settings, ownDataKey: true });
    setMessage({ text: `New key in use. ${out.resealed ?? 0} stored keys re-encrypted.` });
  }

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="flex items-center gap-2 font-semibold">
          <Timer className="h-4 w-4 text-brand-600" /> Keep call data for
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Calls (transcripts and traces), website chats, caller memories and the connection logs
          older than this are deleted automatically.
        </p>
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Keep call data for"
        >
          {[...settings.choices, null].map((days) => {
            const active = settings.retentionDays === days;
            return (
              <button
                key={String(days)}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy !== null}
                onClick={() => !active && void saveRetention(days)}
                className={active ? "btn-primary" : "btn-secondary"}
              >
                {days === null ? "Forever" : days === 365 ? "1 year" : `${days} days`}
              </button>
            );
          })}
          {busy === "retention" && <Loader2 className="h-4 w-4 animate-spin self-center" />}
        </div>
      </section>
      <section>
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-brand-600" /> Encryption
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Your OpenAI key and your apps&apos; keys are encrypted with a key that belongs to your
          business only
          {settings.ownDataKey ? "" : " (created the first time you save a key)"}. Rotate it if you
          think a key may have leaked.
        </p>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={busy !== null}
          onClick={() => void rotate()}
        >
          {busy === "rotate" && <Loader2 className="h-4 w-4 animate-spin" />}
          Rotate encryption key
        </button>
      </section>
      {message && (
        <p className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

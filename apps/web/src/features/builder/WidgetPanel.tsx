"use client";

import type { WidgetSummary } from "@voice-agent/shared";
import { Check, Copy, Globe, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface Usage {
  chats: number;
  messages: number;
  costUsd: number;
}

interface Form {
  enabled: boolean;
  hosts: string;
  color: string;
  title: string;
  dailyCostCapUsd: string;
  liveChat: boolean;
  whatsappNumber: string;
  phoneNumber: string;
  alertWhatsapp: string;
}

const DEFAULT_FORM: Form = {
  enabled: true,
  hosts: "",
  color: "#6d43f5",
  title: "",
  dailyCostCapUsd: "2",
  liveChat: true,
  whatsappNumber: "",
  phoneNumber: "",
  alertWhatsapp: "",
};

// The agent on the business's website: which sites may show the chat, how it looks, its daily
// cost cap, the one line to paste, and a live preview.
export function WidgetPanel({ agentId }: { agentId: string }) {
  const [widget, setWidget] = useState<WidgetSummary | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/${agentId}/widget`)
      .then((r) => r.json() as Promise<{ widget: WidgetSummary | null; usage: Usage }>)
      .then((data) => {
        if (cancelled) return;
        setWidget(data.widget);
        setUsage(data.usage);
        if (data.widget) {
          setForm({
            enabled: data.widget.enabled,
            hosts: data.widget.allowedHosts.join("\n"),
            color: data.widget.color,
            title: data.widget.title ?? "",
            dailyCostCapUsd: String(data.widget.dailyCostCapUsd),
            liveChat: data.widget.liveChat,
            whatsappNumber: data.widget.whatsappNumber ?? "",
            phoneNumber: data.widget.phoneNumber ?? "",
            alertWhatsapp: data.widget.alertWhatsapp ?? "",
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch(`/api/agents/${agentId}/widget`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: form.enabled,
        allowedHosts: form.hosts.split(/[\n,]+/),
        color: form.color,
        title: form.title.trim() || null,
        dailyCostCapUsd: Number(form.dailyCostCapUsd),
        liveChat: form.liveChat,
        whatsappNumber: form.whatsappNumber,
        phoneNumber: form.phoneNumber,
        alertWhatsapp: form.alertWhatsapp,
      }),
    });
    const body = (await response.json()) as {
      widget?: WidgetSummary;
      error?: string;
      issues?: { message: string }[];
    };
    setSaving(false);
    if (!response.ok || !body.widget) {
      setMessage({ text: body.issues?.[0]?.message ?? body.error ?? "Didn't save.", error: true });
      return;
    }
    setWidget(body.widget);
    setForm({ ...form, hosts: body.widget.allowedHosts.join("\n") });
    setPreviewKey((k) => k + 1);
    setMessage({ text: "Saved." });
  }

  const snippet = widget
    ? `<script src="${typeof window === "undefined" ? "" : window.location.origin}/widget.js" data-agent="${widget.publicId}" async></script>`
    : "";

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!loaded) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="widget-panel">
      <div className="w-[30rem] shrink-0 space-y-6 overflow-y-auto border-r border-slate-200 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Globe className="h-5 w-5 text-brand-600" /> On your website
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            A chat button on your site that talks to visitors with this agent&apos;s live version,
            by text or voice. Paste one line into your site once; everything else is set here.
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Chat is on
        </label>

        <div>
          <label className="label" htmlFor="widget-hosts">
            Websites allowed to show it
          </label>
          <textarea
            id="widget-hosts"
            rows={3}
            className="input font-mono text-xs"
            placeholder={"yourbusiness.com\nshop.yourbusiness.com"}
            value={form.hosts}
            onChange={(e) => setForm({ ...form, hosts: e.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">
            One per line. Subdomains are included. Other sites can&apos;t show your chat.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="widget-title">
              Name in the header
            </label>
            <input
              id="widget-title"
              className="input"
              placeholder="Your business name"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="widget-color">
              Colour
            </label>
            <div className="flex gap-2">
              <input
                id="widget-color"
                type="color"
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
              <input
                aria-label="Colour code"
                className="input font-mono"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">When a visitor wants the team</legend>
          <p className="text-xs text-slate-500">
            Visitors pick how to reach you; the conversation and a summary go with them, so they
            never repeat themselves. Leave a number empty to not offer it.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={form.liveChat}
              onChange={(e) => setForm({ ...form, liveChat: e.target.checked })}
            />
            &quot;Talk to a person&quot;: your team answers in the Inbox
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="widget-whatsapp">
                WhatsApp number
              </label>
              <input
                id="widget-whatsapp"
                className="input"
                placeholder="+34600111222"
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="widget-phone">
                Number to call
              </label>
              <input
                id="widget-phone"
                className="input"
                placeholder="+34910000000"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="widget-alert">
              Alert the team on WhatsApp
            </label>
            <input
              id="widget-alert"
              className="input"
              placeholder="+34600111222 (your team's phone)"
              value={form.alertWhatsapp}
              onChange={(e) => setForm({ ...form, alertWhatsapp: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Live-chat requests and call-backs are sent here with a summary and a link to the chat.
              They always appear in the Inbox too.
            </p>
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="widget-cap">
            Daily AI cost cap (USD)
          </label>
          <input
            id="widget-cap"
            type="number"
            min={0.1}
            max={100}
            step={0.5}
            className="input w-32"
            value={form.dailyCostCapUsd}
            onChange={(e) => setForm({ ...form, dailyCostCapUsd: e.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">
            When today&apos;s chats reach it, new messages are politely refused until tomorrow
            (UTC).
            {usage &&
              ` Today: ${usage.chats} chats, ${usage.messages} messages, $${usage.costUsd.toFixed(4)}.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {widget ? "Save" : "Create the website chat"}
          </button>
          {message && (
            <span className={`text-sm ${message.error ? "text-red-600" : "text-emerald-700"}`}>
              {message.text}
            </span>
          )}
        </div>

        {widget && (
          <div>
            <div className="label">Add this to your website, before &lt;/body&gt;</div>
            <div className="relative">
              <pre className="rounded-xl bg-ink p-4 pr-12 text-xs leading-relaxed break-all whitespace-pre-wrap text-slate-100">
                {snippet}
              </pre>
              <button
                type="button"
                onClick={() => void copy()}
                className="absolute top-2.5 right-2.5 rounded-lg bg-white/10 p-1.5 text-slate-200 hover:bg-white/20"
                aria-label="Copy the snippet"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Works with any site: paste it in your theme&apos;s footer, or add it as a custom HTML
              tag in Google Tag Manager.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center bg-canvas p-8">
        {widget ? (
          widget.enabled ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-xs font-medium tracking-wider text-slate-500 uppercase">
                Live preview · a real chat with the live version
              </div>
              <iframe
                key={previewKey}
                title="Website chat preview"
                src={`/embed/${widget.publicId}?preview=1`}
                allow="microphone; autoplay"
                className="h-[600px] w-[380px] rounded-2xl border-0 bg-white shadow-2xl"
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">The chat is off. Turn it on to preview it.</p>
          )
        ) : (
          <p className="max-w-xs text-center text-sm text-slate-500">
            Create the website chat to get your snippet and a live preview.
          </p>
        )}
      </div>
    </div>
  );
}

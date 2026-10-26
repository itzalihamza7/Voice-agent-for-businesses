"use client";

import type { HandoffChannel, WebChatMessageView } from "@voice-agent/shared";
import {
  Bell,
  BellRing,
  Bot,
  Check,
  Headset,
  Inbox as InboxIcon,
  Loader2,
  MessageCircle,
  Phone,
  PhoneIncoming,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

interface Item {
  id: string;
  title: string | null;
  agentName: string;
  mode: "bot" | "waiting" | "live";
  handoff: HandoffChannel | null;
  reference: string | null;
  summary: string | null;
  visitorName: string | null;
  visitorContact: string | null;
  needsAttention: boolean;
  lastMessage: string | null;
  lastMessageAt: string;
}

interface Detail extends Omit<Item, "lastMessage" | "lastMessageAt"> {
  assignedTo: string | null;
  callId: string | null;
  createdAt: string;
  messages: WebChatMessageView[];
}

const CHANNEL: Record<HandoffChannel, { label: string; icon: typeof Headset }> = {
  person: { label: "Wants a person", icon: Headset },
  whatsapp: { label: "Went to WhatsApp", icon: MessageCircle },
  call: { label: "Was given the number", icon: Phone },
  callback: { label: "Call back", icon: PhoneIncoming },
};

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : new Date(iso).toLocaleDateString();
};

/** A short tone when a hand-off arrives (no audio file needed). */
function chime() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.4);
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.4);
  } catch {
    // No sound: the badge and the list still show it.
  }
}

// The team's side of website chats: who needs a person now (live chats, call-backs, WhatsApp
// hand-offs), the whole conversation with a summary, and answering in the visitor's chat.
export function Inbox({ chatId }: { chatId: string | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"attention" | "all">("attention");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [attention, setAttention] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState<NotificationPermission | "unsupported">("default");
  const lastAttention = useRef<number | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const permission = "Notification" in window ? Notification.permission : "unsupported";
    void Promise.resolve().then(() => setAlerts(permission));
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ filter, ...(query.trim() ? { q: query.trim() } : {}) });
    const response = await fetch(`/api/inbox?${params}`);
    if (!response.ok) return;
    const body = (await response.json()) as { items: Item[]; attention: number };
    setItems(body.items);
    setAttention(body.attention);
    if (lastAttention.current !== null && body.attention > lastAttention.current) {
      chime();
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("A website visitor needs you", {
          body: body.items.find((i) => i.needsAttention)?.title ?? "Open the Inbox to reply.",
        });
      }
    }
    lastAttention.current = body.attention;
  }, [filter, query]);

  const loadDetail = useCallback(async () => {
    if (!chatId) return;
    const response = await fetch(`/api/inbox/${chatId}`);
    if (response.ok) setDetail(((await response.json()) as { chat: Detail }).chat);
  }, [chatId]);

  useEffect(() => {
    void Promise.resolve().then(loadList);
    const timer = setInterval(() => void loadList(), 4000);
    return () => clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    void Promise.resolve().then(() => (chatId ? loadDetail() : setDetail(null)));
    const timer = setInterval(() => void loadDetail(), 2500);
    return () => clearInterval(timer);
  }, [chatId, loadDetail]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  async function act(path: string, body?: unknown) {
    if (!chatId) return;
    setBusy(true);
    await fetch(`/api/inbox/${chatId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    setBusy(false);
    await Promise.all([loadDetail(), loadList()]);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (!text) return;
    setReply("");
    await act("messages", { text });
  }

  return (
    <div className="-mx-10 -my-10 flex h-screen bg-white">
      <aside className="flex w-[22rem] shrink-0 flex-col border-r border-slate-200">
        <div className="border-b border-slate-200 px-4 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-3xl tracking-tight text-ink">Inbox</h1>
            {alerts === "default" && (
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => void Notification.requestPermission().then(setAlerts)}
                title="Get a desktop notification when a visitor needs you"
              >
                <Bell className="h-3.5 w-3.5" /> Enable alerts
              </button>
            )}
            {alerts === "granted" && (
              <span className="flex items-center gap-1 text-xs text-emerald-700">
                <BellRing className="h-3.5 w-3.5" /> Alerts on
              </span>
            )}
          </div>
          <div className="mt-3 flex rounded-xl bg-slate-100 p-1 text-sm" role="tablist">
            {(
              [
                ["attention", `Needs you${attention ? ` · ${attention}` : ""}`],
                ["all", "All chats"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${
                  filter === key
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search chats"
              className="input pl-9"
              placeholder="Reference, name, number or words"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto" data-testid="inbox-list">
          {items === null ? (
            <li className="p-6 text-sm text-slate-500">Loading…</li>
          ) : items.length === 0 ? (
            <li className="flex flex-col items-center px-6 py-14 text-center">
              <InboxIcon className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                {filter === "attention" ? "Nobody is waiting for you" : "No website chats yet"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {filter === "attention"
                  ? "When a visitor asks for a person, a call-back or WhatsApp, it lands here."
                  : "Add the website chat to your site from an agent's Website tab."}
              </p>
            </li>
          ) : (
            items.map((item) => {
              const channel = item.handoff ? CHANNEL[item.handoff] : null;
              const active = item.id === chatId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/inbox/${item.id}`)}
                    className={`relative block w-full px-4 py-3 text-left transition ${
                      active ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                  >
                    {item.needsAttention && (
                      <span className="absolute top-4 left-1.5 h-2 w-2 rounded-full bg-brand-500" />
                    )}
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {item.visitorName ?? item.title ?? "Website visitor"}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {ago(item.lastMessageAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{item.lastMessage}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.mode === "waiting" && (
                        <span className="badge bg-amber-50 text-amber-800">Waiting</span>
                      )}
                      {item.mode === "live" && (
                        <span className="badge bg-emerald-50 text-emerald-700">Live</span>
                      )}
                      {channel && item.handoff !== "person" && (
                        <span className="badge bg-slate-100 text-slate-600">
                          <channel.icon className="h-3 w-3" /> {channel.label}
                        </span>
                      )}
                      {item.reference && (
                        <span className="badge bg-slate-100 font-mono text-slate-500">
                          {item.reference}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        {!chatId || !detail ? (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-200/60">
              <Headset className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-2xl text-ink">
              {chatId ? "Loading the chat…" : "Pick a conversation"}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              You&apos;ll see everything the visitor and the assistant said, and a summary, before
              you reply. The visitor sees your first name.
            </p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-ink">
                  {detail.visitorName ?? detail.title ?? "Website visitor"}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span>{detail.agentName}</span>
                  {detail.reference && <span className="font-mono">{detail.reference}</span>}
                  {detail.visitorContact && (
                    <a
                      href={`tel:${detail.visitorContact}`}
                      className="text-brand-600 hover:underline"
                    >
                      {detail.visitorContact}
                    </a>
                  )}
                  {detail.callId && (
                    <Link
                      href={`/dashboard/calls/${detail.callId}`}
                      className="text-brand-600 hover:underline"
                    >
                      Full trace
                    </Link>
                  )}
                </p>
              </div>
              {detail.mode !== "live" && (detail.mode === "waiting" || !detail.handoff) && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void act("join")}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Headset className="h-4 w-4" />
                  )}
                  Join the chat
                </button>
              )}
              {(detail.mode !== "bot" || detail.needsAttention) && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void act("finish")}
                >
                  {detail.mode === "bot" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                  {detail.mode === "bot" ? "Mark done" : "Hand back to the AI"}
                </button>
              )}
            </header>

            {detail.summary && (
              <div className="mx-6 mt-4 flex gap-3 rounded-xl border border-brand-200/70 bg-brand-50/60 px-4 py-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <div className="text-xs font-semibold text-brand-800">Summary</div>
                  <p className="text-sm text-slate-700">{detail.summary}</p>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {detail.messages.map((m) =>
                m.sender === "system" ? (
                  <p key={m.id} className="text-center text-[11px] text-slate-400">
                    {m.text} ·{" "}
                    {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                ) : (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === "visitor" ? "justify-start" : "justify-end"}`}
                  >
                    <div className="max-w-[70%]">
                      <div
                        className={`mb-1 flex items-center gap-1 text-[11px] text-slate-400 ${
                          m.sender === "visitor" ? "" : "justify-end"
                        }`}
                      >
                        {m.sender === "visitor" ? (
                          <UserRound className="h-3 w-3" />
                        ) : m.sender === "agent" ? (
                          <Sparkles className="h-3 w-3" />
                        ) : (
                          <Headset className="h-3 w-3" />
                        )}
                        {m.sender === "visitor"
                          ? "Visitor"
                          : m.sender === "agent"
                            ? "AI"
                            : (m.author ?? "Team")}
                      </div>
                      <p
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                          m.sender === "visitor"
                            ? "rounded-tl-sm bg-white ring-1 ring-slate-200"
                            : m.sender === "agent"
                              ? "rounded-tr-sm bg-slate-100 text-slate-700"
                              : "rounded-tr-sm bg-brand-600 text-white"
                        }`}
                      >
                        {m.text}
                      </p>
                    </div>
                  </div>
                ),
              )}
              <div ref={bottom} />
            </div>

            <form
              onSubmit={send}
              className="flex items-center gap-2 border-t border-slate-200 bg-white px-6 py-4"
            >
              <input
                aria-label="Reply to the visitor"
                className="input flex-1"
                placeholder={
                  detail.mode === "live"
                    ? "Write to the visitor"
                    : "Write to the visitor (you'll join the chat and the AI will stop)"
                }
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={busy || !reply.trim()}>
                <Send className="h-4 w-4" /> Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

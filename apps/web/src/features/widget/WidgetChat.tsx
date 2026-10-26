"use client";

import type {
  HandoffChannel,
  WebChatMessageView,
  WebChatView,
  WidgetPublicConfig,
} from "@voice-agent/shared";
import {
  ArrowLeft,
  ArrowUp,
  Clock,
  Headset,
  History,
  Loader2,
  MessageCircle,
  Mic,
  Phone,
  PhoneIncoming,
  Plus,
  Sparkles,
  Square,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { LogoMark } from "@/features/ui/Logo";
import { BRAND } from "@/features/ui/brand";
import {
  clearCurrent,
  currentChat,
  forgetChat,
  rememberChat,
  storedChats,
  type StoredChat,
} from "./chat-storage";

interface Message extends Omit<WebChatMessageView, "id"> {
  id: string;
}

interface Chat {
  chatId: string;
  token: string;
  title: string | null;
  mode: WebChatView["mode"];
  ended: boolean;
  reference: string | null;
  messages: Message[];
}

interface TurnAnswer {
  replies: string[];
  ended: boolean;
  handoffSuggested?: boolean;
  mode?: WebChatView["mode"];
  error?: string;
}

/** What the agent is doing right now, and the reply's sentences so far (streamed). */
interface Working {
  status: string;
  partial: string[];
}

const noSubscription = () => () => {};
const now = () => new Date().toISOString();
let localId = 0;
const local = (sender: Message["sender"], text: string, author: string | null = null): Message => ({
  id: `local-${++localId}`,
  sender,
  text,
  author,
  at: now(),
});

/** The server's messages, plus what this window is still sending (not saved there yet). */
function withPending(server: Message[], shown: Message[]): Message[] {
  const pending = shown.filter(
    (m) =>
      m.id.startsWith("local-") &&
      m.sender === "visitor" &&
      !server.some((s) => s.sender === "visitor" && s.text === m.text),
  );
  return [...server, ...pending];
}

/** Reads a server-sent event stream, calling `on` for each event. */
async function readEvents(response: Response, on: (event: string, data: unknown) => void) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (data) on(event, JSON.parse(data));
    }
  }
}

// The visitor's chat on the business's website: typed or spoken, streamed as the agent works,
// with a way to reach the team (a person here, WhatsApp, a call or a call-back) that always
// carries the conversation, and every earlier chat one tap away.
export function WidgetChat({
  publicId,
  config,
  preview = false,
}: {
  publicId: string;
  config: WidgetPublicConfig;
  /** In the builder's preview: no close button (there's nothing to close). */
  preview?: boolean;
}) {
  const { title, color } = config;
  const [chat, setChat] = useState<Chat | null>(null);
  const [view, setView] = useState<"chat" | "history" | "contact">("chat");
  const [text, setText] = useState("");
  const [working, setWorking] = useState<Working | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const begun = useRef(false);
  const chatRef = useRef<Chat | null>(null);
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  // In the website's frame (show a close button), or opened on its own.
  const inFrame = useSyncExternalStore(
    noSubscription,
    () => window.parent !== window,
    () => false,
  );

  const remember = useCallback(
    (next: Chat) => {
      const stored = storedChats(publicId).find((c) => c.chatId === next.chatId);
      rememberChat(publicId, {
        chatId: next.chatId,
        token: next.token,
        title: next.title ?? next.messages.find((m) => m.sender === "visitor")?.text ?? null,
        startedAt: stored?.startedAt ?? now(),
        lastAt: next.messages.at(-1)?.at ?? now(),
      });
    },
    [publicId],
  );

  /** The chat as the server has it (every message, the mode), replacing what's shown. */
  const load = useCallback(
    async (stored: Pick<StoredChat, "chatId" | "token">): Promise<Chat | null> => {
      const response = await fetch(
        `/api/widget/${publicId}/chats/${stored.chatId}?token=${encodeURIComponent(stored.token)}`,
      );
      if (!response.ok) return null;
      const { chat: server } = (await response.json()) as { chat: WebChatView };
      return {
        chatId: server.id,
        token: stored.token,
        title: server.title,
        mode: server.mode,
        ended: server.ended,
        reference: server.reference,
        messages: server.messages,
      };
    },
    [publicId],
  );

  const show = useCallback(
    (next: Chat) => {
      setChat(next);
      remember(next);
    },
    [remember],
  );

  const start = useCallback(async () => {
    setError(null);
    setWorking({ status: "Connecting", partial: [] });
    try {
      const response = await fetch(`/api/widget/${publicId}/chats`, { method: "POST" });
      const body = (await response.json()) as TurnAnswer & { chatId?: string; token?: string };
      if (!response.ok || !body.chatId || !body.token) {
        setError(body.error ?? "The chat couldn't start.");
        return;
      }
      show({
        chatId: body.chatId,
        token: body.token,
        title: null,
        mode: "bot",
        ended: body.ended,
        reference: null,
        messages: body.replies.map((t) => local("agent", t)),
      });
    } catch {
      setError("The chat couldn't start. Check your connection.");
    } finally {
      setWorking(null);
    }
  }, [publicId, show]);

  const newChat = useCallback(() => {
    clearCurrent(publicId);
    setChat(null);
    setView("chat");
    setNotice(null);
    void start();
  }, [publicId, start]);

  // Continue the visitor's last chat on this site, or start one.
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    const stored = currentChat(publicId);
    void (async () => {
      const loaded = stored ? await load(stored).catch(() => null) : null;
      if (loaded) setChat(loaded);
      else {
        if (stored) forgetChat(publicId, stored.chatId);
        await start();
      }
    })();
  }, [publicId, load, start]);

  // The website tells the chat when it is shown or hidden; new messages while hidden light up
  // the button.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data === "vesper:opened") setPanelOpen(true);
      if (event.data === "vesper:closed") setPanelOpen(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // New messages from the team (and the chat's mode): often while a person is involved, now
  // and then otherwise (someone may join any chat).
  const waitingOnTeam = chat?.mode === "waiting" || chat?.mode === "live";
  useEffect(() => {
    if (!chat) return;
    const every = waitingOnTeam ? 2500 : panelOpen ? 8000 : 20000;
    const timer = setInterval(async () => {
      const current = chatRef.current;
      if (!current || working) return;
      const last = [...current.messages].reverse().find((m) => !m.id.startsWith("local-"));
      const after = last?.at ?? current.messages.at(-1)?.at ?? "";
      try {
        const response = await fetch(
          `/api/widget/${publicId}/chats/${current.chatId}?token=${encodeURIComponent(current.token)}&after=${encodeURIComponent(after)}`,
        );
        if (!response.ok) return;
        const { chat: server } = (await response.json()) as { chat: WebChatView };
        const known = new Set(current.messages.map((m) => m.id));
        const fresh = server.messages.filter(
          (m) =>
            !known.has(m.id) &&
            !(
              m.sender === "visitor" &&
              current.messages.some((c) => c.id.startsWith("local-") && c.text === m.text)
            ),
        );
        if (fresh.length === 0 && server.mode === current.mode) return;
        setChat((prev) =>
          prev && prev.chatId === server.id
            ? {
                ...prev,
                mode: server.mode,
                ended: server.ended,
                reference: server.reference,
                messages: [...prev.messages, ...fresh],
              }
            : prev,
        );
        if (!panelOpen && fresh.some((m) => m.sender !== "visitor")) {
          window.parent.postMessage("vesper:unread", "*");
        }
      } catch {
        // Offline for a moment: the next poll catches up.
      }
    }, every);
    return () => clearInterval(timer);
  }, [chat, waitingOnTeam, panelOpen, publicId, working]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat?.messages.length, working?.partial.length, working?.status, view]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    const current = chat;
    if (!current || !message || working) return;
    setText("");
    setError(null);
    setNotice(null);
    const withMine = { ...current, messages: [...current.messages, local("visitor", message)] };
    setChat(withMine);
    if (current.mode !== "bot") {
      // A person is (or will be) answering: no AI turn, the message just goes to them.
      try {
        await fetch(`/api/widget/${publicId}/chats/${current.chatId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: current.token, text: message }),
        });
      } catch {
        setError("That didn't go through. Check your connection.");
      }
      return;
    }
    setWorking({ status: "Reading your message", partial: [] });
    let answer: TurnAnswer | null = null;
    try {
      const response = await fetch(`/api/widget/${publicId}/chats/${current.chatId}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ token: current.token, text: message }),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("event-stream")) {
        const body = (await response.json()) as TurnAnswer;
        if (!response.ok) throw new Error(body.error ?? "That didn't go through.");
        answer = body;
      } else {
        await readEvents(response, (name, data) => {
          if (name === "status") {
            setWorking((w) => ({
              status: (data as { status: string }).status,
              partial: w?.partial ?? [],
            }));
          } else if (name === "text") {
            setWorking((w) => ({
              status: w?.status ?? "",
              partial: [...(w?.partial ?? []), (data as { text: string }).text],
            }));
          } else if (name === "done") {
            answer = data as TurnAnswer;
          } else if (name === "error") {
            throw new Error((data as { error?: string }).error ?? "Something went wrong.");
          }
        });
      }
      const done = answer as TurnAnswer | null;
      if (!done) throw new Error("The reply was cut off. Please try again.");
      // The server has the turn now (in order, with anything the team wrote meanwhile).
      const loaded = await load(current).catch(() => null);
      show(
        loaded ?? {
          ...withMine,
          ended: done.ended,
          mode: done.mode ?? withMine.mode,
          messages: [...withMine.messages, ...done.replies.map((t) => local("agent", t))],
        },
      );
      if (done.handoffSuggested) setView("contact");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That didn't go through. Check your connection.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!chat) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        void sendVoice(chat, new Blob(parts, { type: rec.mimeType || "audio/webm" }));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("The microphone isn't available. You can type instead.");
    }
  }

  async function sendVoice(current: Chat, audio: Blob) {
    setWorking({ status: "Listening", partial: [] });
    try {
      const form = new FormData();
      form.set("audio", audio, "voice.webm");
      form.set("token", current.token);
      const response = await fetch(`/api/widget/${publicId}/chats/${current.chatId}/voice`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as TurnAnswer & {
        heard?: string;
        audio?: string | null;
        mimeType?: string | null;
      };
      if (!response.ok) return setError(body.error ?? "That didn't go through.");
      if (!body.heard) return setError("Sorry, I didn't catch that. Try again or type.");
      show({
        ...current,
        ended: body.ended,
        mode: body.mode ?? current.mode,
        messages: [
          ...current.messages,
          local("visitor", body.heard),
          ...body.replies.map((t) => local("agent", t)),
        ],
      });
      if (body.handoffSuggested) setView("contact");
      if (body.audio) {
        void new Audio(`data:${body.mimeType ?? "audio/mpeg"};base64,${body.audio}`)
          .play()
          .catch(() => undefined);
      }
    } catch {
      setError("That didn't go through. Check your connection.");
    } finally {
      setWorking(null);
    }
  }

  async function handoff(
    channel: HandoffChannel,
    details: { name?: string; contact?: string } = {},
  ) {
    if (!chat) return;
    setError(null);
    // Opened now, while the tap still counts as the visitor's: browsers block it later.
    const popup = channel === "whatsapp" ? window.open("about:blank", "_blank") : null;
    try {
      const response = await fetch(`/api/widget/${publicId}/chats/${chat.chatId}/handoff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: chat.token, channel, ...details }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        whatsappUrl?: string;
        phoneNumber?: string;
        reference?: string;
      };
      if (!response.ok) {
        popup?.close();
        return setError(body.error ?? "That didn't work. Please try again.");
      }
      if (body.whatsappUrl) {
        if (popup) popup.location.href = body.whatsappUrl;
        else window.open(body.whatsappUrl, "_blank");
      }
      setNotice(body.message ?? null);
      setView("chat");
      const loaded = await load(chat);
      if (loaded) {
        show({
          ...loaded,
          messages: withPending(loaded.messages, chatRef.current?.messages ?? []),
        });
      }
    } catch {
      popup?.close();
      setError("That didn't work. Check your connection.");
    }
  }

  const accent = { "--accent": color } as CSSProperties;
  const staffName = [...(chat?.messages ?? [])].reverse().find((m) => m.sender === "staff")?.author;
  const status =
    chat?.mode === "live"
      ? `${staffName ?? "Someone"} from the team is here`
      : chat?.mode === "waiting"
        ? "Waiting for the team…"
        : "AI assistant · answers instantly";
  const canContact = config.liveChat || config.whatsappNumber || config.phoneNumber;

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900" style={accent}>
      <header className="relative flex items-center gap-3 overflow-hidden bg-[var(--accent)] px-4 py-3.5 text-white">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/15 to-transparent" />
        {view !== "chat" ? (
          <button
            type="button"
            onClick={() => setView("chat")}
            className="relative rounded-lg p-1.5 text-white/90 hover:bg-white/15"
            aria-label="Back to the chat"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            {chat?.mode === "live" ? (
              <UserRound className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--accent)] bg-emerald-300" />
          </span>
        )}
        <div className="relative min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {view === "history" ? "Your chats" : view === "contact" ? "Contact the team" : title}
          </div>
          {view === "chat" && <div className="truncate text-xs text-white/80">{status}</div>}
        </div>
        {view === "chat" && (
          <>
            <button
              type="button"
              onClick={() => setView("history")}
              className="relative rounded-lg p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
              aria-label="Your earlier chats"
              title="Your earlier chats"
            >
              <History className="h-4 w-4" />
            </button>
            {canContact && (
              <button
                type="button"
                onClick={() => setView("contact")}
                className="relative rounded-lg p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
                aria-label="Contact the team"
                title="Contact the team"
              >
                <Headset className="h-4 w-4" />
              </button>
            )}
          </>
        )}
        {inFrame && !preview && (
          <button
            type="button"
            onClick={() => window.parent.postMessage("vesper:close", "*")}
            className="relative rounded-lg p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
            aria-label="Close the chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {view === "history" ? (
        <HistoryList
          publicId={publicId}
          currentId={chat?.chatId ?? null}
          onOpen={async (stored) => {
            const loaded = await load(stored);
            if (!loaded) {
              forgetChat(publicId, stored.chatId);
              setError("That chat is no longer available.");
              setView("chat");
              return;
            }
            show(loaded);
            setView("chat");
          }}
          onNew={newChat}
        />
      ) : view === "contact" ? (
        <ContactOptions
          config={config}
          onPick={(channel, details) => void handoff(channel, details)}
        />
      ) : (
        <>
          {chat?.mode === "waiting" && (
            <WaitingBanner
              since={[...chat.messages].reverse().find((m) => m.sender === "system")?.at ?? now()}
              onOther={() => setView("contact")}
              hasOthers={Boolean(config.whatsappNumber || config.phoneNumber)}
            />
          )}
          <div
            className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4"
            aria-live="polite"
          >
            {chat?.messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {working && (
              <div className="space-y-2">
                {working.partial.length > 0 && (
                  <p className="max-w-[85%] animate-fade-up rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ring-1 ring-slate-200/70">
                    {working.partial.join(" ")}
                  </p>
                )}
                <div className="flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200/70">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                  </span>
                  {working.status}…
                </div>
              </div>
            )}
            {notice && (
              <p
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                role="status"
              >
                {notice}
              </p>
            )}
            {chat?.ended && chat.mode === "bot" && (
              <div className="pt-2 text-center">
                <p className="text-xs text-slate-500">This chat has ended.</p>
                <button
                  type="button"
                  onClick={newChat}
                  className="mt-2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white"
                >
                  Start a new chat
                </button>
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                {error}
              </p>
            )}
            <div ref={bottom} />
          </div>

          {canContact &&
            chat?.mode === "bot" &&
            chat.messages.filter((m) => m.sender === "visitor").length > 0 && (
              <div className="flex justify-center border-t border-slate-100 bg-white pt-2">
                <button
                  type="button"
                  onClick={() => setView("contact")}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-[var(--accent)] hover:text-slate-900"
                >
                  <Headset className="h-3.5 w-3.5" /> Talk to the team
                </button>
              </div>
            )}
          <form
            onSubmit={send}
            className="flex items-center gap-2 border-t border-slate-200 px-3 py-3"
          >
            <input
              aria-label="Your message"
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
              placeholder={
                recording
                  ? "Listening… tap stop when done"
                  : chat?.mode === "bot"
                    ? "Ask anything"
                    : "Write to the team"
              }
              value={text}
              maxLength={1000}
              disabled={!chat || (chat.ended && chat.mode === "bot") || recording}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void toggleRecording()}
              disabled={
                !chat || (chat.ended && chat.mode === "bot") || (Boolean(working) && !recording)
              }
              aria-label={recording ? "Stop and send" : "Speak instead"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
                recording
                  ? "animate-pulse bg-red-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="submit"
              disabled={
                !chat || (chat.ended && chat.mode === "bot") || Boolean(working) || !text.trim()
              }
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition disabled:opacity-40"
            >
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </form>
        </>
      )}
      <p className="flex items-center justify-center gap-1.5 pb-2.5 text-[11px] text-slate-400">
        Powered by <LogoMark className="h-3.5 w-3.5" /> {BRAND}
      </p>
    </div>
  );
}

function Bubble({ message: m }: { message: Message }) {
  if (m.sender === "system") {
    return <p className="text-center text-[11px] text-slate-400">{m.text}</p>;
  }
  if (m.sender === "visitor") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--accent)] px-3.5 py-2.5 text-sm leading-relaxed text-white">
        {m.text}
      </p>
    );
  }
  return (
    <div className="max-w-[85%]">
      {m.sender === "staff" && (
        <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <UserRound className="h-3 w-3" /> {m.author ?? "Team"} · team
        </div>
      )}
      <p
        className={`rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ring-1 ${
          m.sender === "staff" ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200/70"
        }`}
      >
        {m.text}
      </p>
    </div>
  );
}

function WaitingBanner({
  since,
  onOther,
  hasOthers,
}: {
  since: string;
  onOther: () => void;
  hasOthers: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.parse(since));
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(since)) / 1000));
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        The team has been told. Waiting {Math.floor(seconds / 60)}:
        {String(seconds % 60).padStart(2, "0")}
        {seconds > 60 && hasOthers ? ". Prefer WhatsApp or a call?" : ""}
      </span>
      {seconds > 60 && hasOthers && (
        <button type="button" onClick={onOther} className="font-semibold underline">
          Other ways
        </button>
      )}
    </div>
  );
}

function ContactOptions({
  config,
  onPick,
}: {
  config: WidgetPublicConfig;
  onPick: (channel: HandoffChannel, details?: { name?: string; contact?: string }) => void;
}) {
  const [callback, setCallback] = useState(false);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const option = (icon: ReactNode, label: string, hint: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-[var(--accent)] hover:shadow-md"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[var(--accent)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
  return (
    <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
      <p className="text-xs text-slate-500">
        Whichever you choose, the team sees this conversation, so you won&apos;t have to repeat
        yourself.
      </p>
      {config.liveChat &&
        option(
          <Headset className="h-4 w-4" />,
          "Talk to a person",
          "Someone from the team replies here",
          () => onPick("person"),
        )}
      {config.whatsappNumber &&
        option(
          <MessageCircle className="h-4 w-4" />,
          "Continue on WhatsApp",
          "Opens WhatsApp with your question",
          () => onPick("whatsapp"),
        )}
      {config.phoneNumber &&
        option(<Phone className="h-4 w-4" />, "Call us", config.phoneNumber, () => onPick("call"))}
      {option(
        <PhoneIncoming className="h-4 w-4" />,
        "Request a call back",
        "Leave your number, we'll call you",
        () => setCallback(true),
      )}
      {callback && (
        <form
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (number.trim())
              onPick("callback", { name: name.trim() || undefined, contact: number.trim() });
          }}
        >
          <input
            aria-label="Your name"
            placeholder="Your name (optional)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="Your phone number"
            placeholder="Your phone number"
            type="tel"
            required
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <button
            type="submit"
            className="w-full rounded-full bg-[var(--accent)] py-2 text-sm font-medium text-white"
          >
            Call me back
          </button>
        </form>
      )}
    </div>
  );
}

function HistoryList({
  publicId,
  currentId,
  onOpen,
  onNew,
}: {
  publicId: string;
  currentId: string | null;
  onOpen: (chat: StoredChat) => void;
  onNew: () => void;
}) {
  const chats = storedChats(publicId).filter((c) => c.title || c.chatId === currentId);
  return (
    <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" /> New chat
      </button>
      {chats.length === 0 && (
        <p className="pt-6 text-center text-xs text-slate-500">
          Your chats on this website appear here.
        </p>
      )}
      {chats.map((c) => (
        <button
          key={c.chatId}
          type="button"
          onClick={() => onOpen(c)}
          className={`w-full rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-[var(--accent)] ${
            c.chatId === currentId ? "border-[var(--accent)]" : "border-slate-200"
          }`}
        >
          <span className="block truncate text-sm font-medium">{c.title ?? "New chat"}</span>
          <span className="block text-xs text-slate-500">
            {new Date(c.lastAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {c.chatId === currentId ? " · current" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

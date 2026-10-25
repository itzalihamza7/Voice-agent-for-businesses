"use client";

import { ArrowUp, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import { LogoMark } from "@/features/ui/Logo";
import { BRAND } from "@/features/ui/brand";

interface Message {
  who: "agent" | "visitor";
  text: string;
}

interface Chat {
  chatId: string;
  token: string;
  messages: Message[];
  ended: boolean;
}

interface TurnReply {
  replies: string[];
  ended: boolean;
  error?: string;
}

const storageKey = (publicId: string) => `vesper-chat:${publicId}`;
const noSubscription = () => () => {};

function loadChat(publicId: string): Chat | null {
  try {
    const raw = sessionStorage.getItem(storageKey(publicId));
    return raw ? (JSON.parse(raw) as Chat) : null;
  } catch {
    return null;
  }
}

function saveChat(publicId: string, chat: Chat | null) {
  try {
    if (chat) sessionStorage.setItem(storageKey(publicId), JSON.stringify(chat));
    else sessionStorage.removeItem(storageKey(publicId));
  } catch {
    // Storage blocked (private mode, third-party frame): the chat just won't survive a reload.
  }
}

// The visitor's chat: typed or spoken, with the business's colour. Kept in sessionStorage so
// moving between pages of the site continues the same chat.
export function WidgetChat({
  publicId,
  title,
  color,
  preview = false,
}: {
  publicId: string;
  title: string;
  color: string;
  /** In the builder's preview: no close button (there's nothing to close). */
  preview?: boolean;
}) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  // In the website's frame (show a close button), or opened on its own.
  const inFrame = useSyncExternalStore(
    noSubscription,
    () => window.parent !== window,
    () => false,
  );
  const recorder = useRef<MediaRecorder | null>(null);
  // One chat per page load, even when React runs the effect twice (development).
  const begun = useRef(false);
  const bottom = useRef<HTMLDivElement | null>(null);

  const update = useCallback(
    (next: Chat | null) => {
      setChat(next);
      saveChat(publicId, next);
    },
    [publicId],
  );

  const start = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/widget/${publicId}/chats`, { method: "POST" });
      const body = (await response.json()) as TurnReply & { chatId?: string; token?: string };
      if (!response.ok || !body.chatId || !body.token) {
        setError(body.error ?? "The chat couldn't start.");
        return;
      }
      update({
        chatId: body.chatId,
        token: body.token,
        ended: body.ended,
        messages: body.replies.map((t) => ({ who: "agent", text: t })),
      });
    } catch {
      setError("The chat couldn't start. Check your connection.");
    } finally {
      setPending(false);
    }
  }, [publicId, update]);

  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    // Continue the visitor's chat from an earlier page of the site, or start one.
    void Promise.resolve(loadChat(publicId)).then((saved) => (saved ? setChat(saved) : start()));
  }, [publicId, start]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, pending]);

  function apply(current: Chat, said: string | null, body: TurnReply) {
    update({
      ...current,
      ended: body.ended,
      messages: [
        ...current.messages,
        ...(said ? [{ who: "visitor" as const, text: said }] : []),
        ...body.replies.map((t) => ({ who: "agent" as const, text: t })),
      ],
    });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!chat || !message || pending) return;
    setText("");
    setPending(true);
    setError(null);
    const withMine = {
      ...chat,
      messages: [...chat.messages, { who: "visitor" as const, text: message }],
    };
    setChat(withMine);
    try {
      const response = await fetch(`/api/widget/${publicId}/chats/${chat.chatId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: chat.token, text: message }),
      });
      const body = (await response.json()) as TurnReply;
      if (!response.ok) setError(body.error ?? "That didn't go through.");
      else apply(withMine, null, body);
    } catch {
      setError("That didn't go through. Check your connection.");
    } finally {
      setPending(false);
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
    setPending(true);
    try {
      const form = new FormData();
      form.set("audio", audio, "voice.webm");
      form.set("token", current.token);
      const response = await fetch(`/api/widget/${publicId}/chats/${current.chatId}/voice`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as TurnReply & {
        heard?: string;
        audio?: string | null;
        mimeType?: string | null;
      };
      if (!response.ok) return setError(body.error ?? "That didn't go through.");
      if (!body.heard) return setError("Sorry, I didn't catch that. Try again or type.");
      apply(current, body.heard, body);
      if (body.audio) {
        void new Audio(`data:${body.mimeType ?? "audio/mpeg"};base64,${body.audio}`)
          .play()
          .catch(() => undefined);
      }
    } catch {
      setError("That didn't go through. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  function restart() {
    update(null);
    void start();
  }

  const accent = { "--accent": color } as CSSProperties;
  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900" style={accent}>
      <header className="flex items-center gap-3 bg-[var(--accent)] px-4 py-3.5 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
          {title.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="flex items-center gap-1.5 text-xs text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> AI assistant · replies
            instantly
          </div>
        </div>
        {chat && (
          <button
            type="button"
            onClick={restart}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
            aria-label="Start a new chat"
            title="Start a new chat"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        {inFrame && !preview && (
          <button
            type="button"
            onClick={() => window.parent.postMessage("vesper:close", "*")}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
            aria-label="Close the chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
        {chat?.messages.map((m, i) =>
          m.who === "agent" ? (
            <p
              key={i}
              className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ring-1 ring-slate-200/70"
            >
              {m.text}
            </p>
          ) : (
            <p
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--accent)] px-3.5 py-2.5 text-sm leading-relaxed text-white"
            >
              {m.text}
            </p>
          ),
        )}
        {pending && (
          <div className="flex w-fit gap-1 rounded-full bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
        )}
        {chat?.ended && (
          <div className="pt-2 text-center">
            <p className="text-xs text-slate-500">This chat has ended.</p>
            <button
              type="button"
              onClick={restart}
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

      <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-200 px-3 py-3">
        <input
          aria-label="Your message"
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
          placeholder={recording ? "Listening… tap stop when done" : "Type a message"}
          value={text}
          maxLength={1000}
          disabled={!chat || chat.ended || recording}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void toggleRecording()}
          disabled={!chat || chat.ended || (pending && !recording)}
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
          disabled={!chat || chat.ended || pending || !text.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
      <p className="flex items-center justify-center gap-1.5 pb-2.5 text-[11px] text-slate-400">
        Powered by <LogoMark className="h-3.5 w-3.5" /> {BRAND}
      </p>
    </div>
  );
}

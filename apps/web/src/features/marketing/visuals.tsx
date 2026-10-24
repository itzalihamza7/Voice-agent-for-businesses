import {
  BookOpen,
  Check,
  FileText,
  GitBranch,
  Globe,
  MessageSquare,
  Phone,
  PhoneForwarded,
  Play,
  Plug,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Waveform } from "./Waveform";

// Product illustrations for the landing page, drawn with the app's own components and colours.

function Node({
  icon,
  title,
  sub,
  tone = "slate",
  className = "",
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  tone?: "slate" | "brand" | "emerald" | "amber" | "sky";
  className?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-100 text-brand-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    sky: "bg-sky-100 text-sky-700",
  };
  return (
    <div
      className={`absolute flex w-44 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_8px_24px_-12px_rgb(16_24_40/0.25)] ${className}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-900">{title}</div>
        <div className="truncate text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

/** The flow builder: greeting, routing, and three paths. */
export function FlowVisual() {
  const at = (x: number, y: number) => ({ left: `${x}%`, top: `${y}%` });
  return (
    <div className="relative h-80 overflow-hidden rounded-xl bg-[radial-gradient(circle,rgb(148_163_184/0.35)_1px,transparent_1px)] [background-size:18px_18px]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {[
          "M50 14 L50 34",
          "M50 46 C50 60 18 58 18 74",
          "M50 46 L50 74",
          "M50 46 C50 60 82 58 82 74",
        ].map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#a48bff"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div style={at(50, 12)} className="absolute">
        <Node
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Greet"
          sub="“Good evening…”"
        />
      </div>
      <div style={at(50, 40)} className="absolute">
        <Node
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Understand the call"
          sub="4 paths · AI routing"
          tone="brand"
          className="ring-2 ring-brand-400/40"
        />
      </div>
      <div style={at(18, 80)} className="absolute">
        <Node
          icon={<Plug className="h-3.5 w-3.5" />}
          title="Book a ride"
          sub="quote · book"
          tone="emerald"
        />
      </div>
      <div style={at(50, 80)} className="absolute">
        <Node
          icon={<BookOpen className="h-3.5 w-3.5" />}
          title="Answer"
          sub="Knowledge base"
          tone="sky"
        />
      </div>
      <div style={at(82, 80)} className="absolute">
        <Node
          icon={<PhoneForwarded className="h-3.5 w-3.5" />}
          title="Hand over"
          sub="To your team"
          tone="amber"
        />
      </div>
    </div>
  );
}

/** Connecting a website: the scan, the pages and the app's API. */
export function ScanVisual() {
  const pages = [
    "/services/airport-transfers",
    "/services/hourly-chauffeur",
    "/fleet",
    "/faq",
    "/contact",
  ];
  const actions = [
    "search_places",
    "list_vehicles",
    "get_quote",
    "create_booking",
    "find_booking",
    "cancel_booking",
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <Globe className="h-4 w-4 text-slate-400" />
        <span className="flex-1 text-sm text-slate-700">yourbusiness.com</span>
        <span className="badge bg-emerald-50 text-emerald-700">
          <Check className="h-3 w-3" /> Scanned
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <FileText className="h-3.5 w-3.5 text-brand-600" /> Pages → knowledge
          </div>
          <ul className="mt-3 space-y-1.5">
            {pages.map((p) => (
              <li key={p} className="flex items-center gap-2 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-emerald-500" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <Plug className="h-3.5 w-3.5 text-brand-600" /> Booking API detected
          </div>
          <ul className="mt-3 space-y-1.5">
            {actions.map((a) => (
              <li key={a} className="flex items-center gap-2 font-mono text-[11px] text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Evals: test calls scored before a version goes live. */
export function EvalVisual() {
  const cases = [
    ["Books an airport pickup", 100],
    ["Never invents a price", 100],
    ["Hands over when asked", 100],
    ["Refuses a prompt injection", 100],
    ["Answers the cancellation policy", 92],
  ] as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="text-xs font-semibold text-slate-900">Eval run · v5</div>
        <span className="badge bg-emerald-50 text-emerald-700">Ready to go live · 98/100</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {cases.map(([name, score]) => (
          <li key={name} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <span className="flex-1 text-slate-700">{name}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600"
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="w-8 text-right font-medium text-slate-900 tabular-nums">{score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Going live: a number, versions and an A/B split. */
export function ReleaseVisual() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col items-center justify-center rounded-xl bg-ink p-6 text-center">
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-white">
          <span className="absolute inset-0 animate-ring rounded-full bg-brand-500" />
          <Phone className="relative h-6 w-6" />
        </span>
        <div className="mt-4 font-mono text-sm text-white">+44 20 7946 0321</div>
        <div className="mt-1 text-xs text-slate-400">Answering · 24/7</div>
        <Waveform className="mt-4 h-6" barClassName="bg-brand-400" />
      </div>
      <div className="space-y-2">
        {[
          { v: "v5", note: "Live · 80% of calls", tone: "bg-emerald-50 text-emerald-700" },
          { v: "v6", note: "A/B test · 20%", tone: "bg-brand-50 text-brand-700" },
          { v: "v4", note: "Rollback ready", tone: "bg-slate-100 text-slate-600" },
        ].map((r) => (
          <div
            key={r.v}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <span className="font-mono text-sm font-semibold text-slate-900">{r.v}</span>
            <span className={`badge ${r.tone}`}>{r.note}</span>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500">
          Every save is a new version. Nothing changes until you publish.
        </div>
      </div>
    </div>
  );
}

/** Analytics: calls, outcomes and topics. */
export function AnalyticsVisual() {
  const bars = [38, 52, 47, 61, 58, 72, 66, 80, 74, 88, 83, 95];
  const topics = [
    ["Airport transfers", 42],
    ["Prices & quotes", 27],
    ["Change a booking", 18],
    ["Lost property", 7],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold text-slate-900">Calls handled</div>
          <div className="text-xs text-emerald-600">Resolved without a person</div>
        </div>
        <div className="mt-4 flex h-36 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-linear-to-t from-brand-600 to-brand-300"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
        <div className="text-xs font-semibold text-slate-900">What callers ask</div>
        <ul className="mt-3 space-y-3">
          {topics.map(([t, n]) => (
            <li key={t} className="text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>{t}</span>
                <span className="tabular-nums">{n}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${n * 2}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A small "test it" chat for the how-it-works strip. */
export function TestChatVisual() {
  return (
    <div className="space-y-2">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-3 py-2 text-[11px] text-white">
        Do you wait if my flight is late?
      </p>
      <p className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
        Yes, your chauffeur tracks your flight and waits, at no extra cost.
      </p>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Sparkles className="h-3 w-3 text-brand-500" /> From /services/airport-transfers
        <Play className="ml-auto h-3 w-3" />
      </div>
    </div>
  );
}

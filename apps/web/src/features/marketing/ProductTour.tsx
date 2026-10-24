"use client";

import { useState } from "react";
import { AnalyticsVisual, EvalVisual, FlowVisual, ReleaseVisual, ScanVisual } from "./visuals";

const TABS = [
  {
    id: "connect",
    label: "Connect",
    title: "Your website becomes its training",
    text: "Type your address. Your pages become the agent's knowledge and the booking system your site already uses becomes its tools. Nothing on your website changes.",
    visual: <ScanVisual />,
  },
  {
    id: "design",
    label: "Design",
    title: "Every step of the call, on one canvas",
    text: "A visual flow shows what the agent says, how it routes each caller, which actions it may take and when it hands over. Edit it like a diagram.",
    visual: <FlowVisual />,
  },
  {
    id: "test",
    label: "Test",
    title: "Checked before a caller hears it",
    text: "Scripted and simulated callers, including ones trying to trick it, score every version. A version that scores worse can't go live.",
    visual: <EvalVisual />,
  },
  {
    id: "launch",
    label: "Go live",
    title: "A phone number, versions and safe rollouts",
    text: "Point a number at your agent. Publish a version, send a share of calls to a new one, and roll back in one click.",
    visual: <ReleaseVisual />,
  },
  {
    id: "learn",
    label: "Learn",
    title: "Know what every call was about",
    text: "Transcripts, outcomes, sentiment and cost for every call, the topics callers ask about most, and the calls that need a look.",
    visual: <AnalyticsVisual />,
  },
];

export function ProductTour() {
  const [active, setActive] = useState(0);
  const tab = TABS[active]!;
  return (
    <div>
      <div className="mx-auto flex w-fit flex-wrap justify-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(i)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              i === active ? "bg-ink text-white shadow" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-10 grid items-center gap-10 lg:grid-cols-5">
        <div key={`text-${tab.id}`} className="animate-fade-up lg:col-span-2">
          <h3 className="font-display text-4xl leading-tight tracking-tight text-ink">
            {tab.title}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-slate-600">{tab.text}</p>
        </div>
        <div
          key={`visual-${tab.id}`}
          className="animate-fade-up rounded-3xl border border-slate-200 bg-linear-to-br from-slate-50 to-brand-50/60 p-5 shadow-[0_30px_80px_-40px_rgb(61_35_147/0.35)] lg:col-span-3"
        >
          {tab.visual}
        </div>
      </div>
    </div>
  );
}

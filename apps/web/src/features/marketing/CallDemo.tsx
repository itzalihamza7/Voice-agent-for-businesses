"use client";

import { Check, PhoneCall, Sparkles, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { SCENES, type SceneStep } from "./scenes";
import { Waveform } from "./Waveform";

const pause = (step: SceneStep | undefined) =>
  !step ? 4500 : step.kind === "tool" ? 900 : step.kind === "done" ? 1200 : 2100;

// A live-looking call: the transcript writes itself, tool calls tick off, and the booking lands.
// Loops through the example scenes; picking a tab restarts on that one.
export function CallDemo({ tabs = true }: { tabs?: boolean }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [shown, setShown] = useState(1);
  const scene = SCENES[sceneIndex]!;
  const next = scene.steps[shown];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (shown < scene.steps.length) setShown(shown + 1);
      else {
        setSceneIndex((sceneIndex + 1) % SCENES.length);
        setShown(1);
      }
    }, pause(next));
    return () => clearTimeout(timer);
  }, [shown, sceneIndex, scene.steps.length, next]);

  const visible = scene.steps.slice(0, shown);
  const lines = visible.filter((s) => s.kind !== "done");
  const done = visible.find((s) => s.kind === "done");
  const seconds = 4 + shown * 6;
  const clock = `00:${String(seconds).padStart(2, "0")}`;
  const agentTyping = next?.kind === "agent";

  return (
    <div className="relative">
      {tabs && (
        <div className="mb-4 flex flex-wrap justify-center gap-1.5 lg:justify-start">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSceneIndex(i);
                setShown(1);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                i === sceneIndex
                  ? "bg-white text-ink"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="glass relative overflow-hidden bg-ink-2/70">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-white">
            <span className="absolute inset-0 animate-ring rounded-full bg-brand-500" />
            <PhoneCall className="relative h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{scene.business}</div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live call · {clock}
            </div>
          </div>
          <Waveform className="h-7" barClassName="bg-brand-300" active={!done} />
        </div>

        <div className="flex h-[23rem] flex-col justify-end gap-2.5 overflow-hidden px-5 py-5 [mask-image:linear-gradient(to_bottom,transparent,black_18%)]">
          {lines.map((step, i) =>
            step.kind === "tool" ? (
              <div
                key={`${scene.id}-${i}`}
                className="flex animate-fade-up items-center gap-2 self-start rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1.5 font-mono text-[11px] text-emerald-200"
              >
                <Wrench className="h-3 w-3 text-emerald-300" />
                {step.name}
                <span className="text-emerald-300/60">→ {step.detail}</span>
                <Check className="h-3 w-3 text-emerald-300" />
              </div>
            ) : step.kind === "agent" ? (
              <div key={`${scene.id}-${i}`} className="flex animate-fade-up gap-2.5 self-start">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                  <Sparkles className="h-3 w-3" />
                </span>
                <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-100">
                  {step.text}
                </p>
              </div>
            ) : step.kind === "caller" ? (
              <p
                key={`${scene.id}-${i}`}
                className="max-w-[80%] animate-fade-up self-end rounded-2xl rounded-tr-sm bg-linear-to-br from-brand-500 to-brand-700 px-3.5 py-2.5 text-[13px] leading-relaxed text-white"
              >
                {step.text}
              </p>
            ) : null,
          )}
          {agentTyping && (
            <div className="flex gap-1 self-start rounded-full bg-white/[0.07] px-3 py-2.5">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {done?.kind === "done" && (
        <div className="absolute -bottom-6 -left-4 flex animate-fade-up items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl sm:-left-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">{done.title}</div>
            <div className="text-xs text-slate-500">{done.detail}</div>
          </div>
        </div>
      )}
    </div>
  );
}

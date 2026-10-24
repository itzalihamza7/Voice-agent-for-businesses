// Animated voice bars. Each bar gets its own delay and height so the motion looks spoken.
const HEIGHTS = [0.45, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.75, 0.95, 0.55, 0.85, 0.65, 0.4, 0.7];

export function Waveform({
  bars = 14,
  active = true,
  className = "h-8",
  barClassName = "bg-brand-300",
}: {
  bars?: number;
  active?: boolean;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`w-[3px] origin-center rounded-full ${barClassName} ${active ? "animate-wave" : ""}`}
          style={{
            height: `${(HEIGHTS[i % HEIGHTS.length] ?? 0.6) * 100}%`,
            animationDelay: `${(i * 97) % 1100}ms`,
            transform: active ? undefined : "scaleY(0.25)",
          }}
        />
      ))}
    </div>
  );
}

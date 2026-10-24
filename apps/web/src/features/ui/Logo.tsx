import Link from "next/link";
import { BRAND } from "./brand";

/** The mark: five sound bars that dip into a V, on a violet tile. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="vesper-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a48bff" />
          <stop offset="1" stopColor="#5a2fe0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#vesper-mark)" />
      {[
        [6.2, 8],
        [10.6, 11],
        [15, 15.5],
        [19.4, 11],
        [23.8, 8],
      ].map(([x, y]) => (
        <rect key={x} x={x} y={y} width="2.4" height={24 - y!} rx="1.2" fill="white" />
      ))}
    </svg>
  );
}

/** The mark and the name. */
export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <LogoMark />
      <span
        className={`font-display text-[1.6rem] leading-none tracking-tight ${light ? "text-white" : "text-ink"}`}
      >
        {BRAND}
      </span>
    </Link>
  );
}

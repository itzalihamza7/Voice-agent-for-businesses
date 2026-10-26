import Link from "next/link";
import { BRAND } from "./brand";

/**
 * The mark: five sound bars that dip into a V, on a violet tile. The tile is a CSS gradient, not
 * an SVG one: an SVG gradient is found by id, and when the copy holding it is hidden (e.g. the
 * desktop-only panel on a phone) every other copy of the logo loses its colour.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] bg-linear-to-br from-brand-400 to-brand-700 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-full w-full">
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
    </span>
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

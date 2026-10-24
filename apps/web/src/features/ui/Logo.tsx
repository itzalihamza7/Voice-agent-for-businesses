import { AudioLines } from "lucide-react";
import Link from "next/link";
import { BRAND } from "./brand";

/** The brand mark and name. */
export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
        <AudioLines className="h-4.5 w-4.5" />
      </span>
      <span className={light ? "text-white" : "text-slate-900"}>{BRAND}</span>
    </Link>
  );
}

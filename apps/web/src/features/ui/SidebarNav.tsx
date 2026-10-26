"use client";

import {
  BookOpen,
  Bot,
  Inbox,
  LayoutDashboard,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN: Item[] = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/connect", label: "Connect website", icon: Sparkles },
  { href: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/dashboard/calls", label: "Calls & analytics", icon: LayoutDashboard },
];

/** Website visitors waiting for the team, checked every 15 seconds. */
function useWaiting(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const check = () =>
      fetch("/api/inbox/count")
        .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : null))
        .then((body) => active && body && setCount(body.count))
        .catch(() => undefined);
    void check();
    const timer = setInterval(check, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return count;
}

export function SidebarNav({ owner, platformAdmin }: { owner: boolean; platformAdmin: boolean }) {
  const pathname = usePathname();
  const waiting = useWaiting();
  const items = [
    ...MAIN,
    ...(owner
      ? [
          { href: "/connections", label: "App connections", icon: Plug },
          { href: "/settings", label: "Settings", icon: Settings },
        ]
      : []),
    ...(platformAdmin ? [{ href: "/admin", label: "Platform admin", icon: ShieldCheck }] : []),
  ];
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {active && (
              <span className="absolute top-2 bottom-2 -left-4 w-1 rounded-r-full bg-brand-400" />
            )}
            <Icon className={`h-4 w-4 ${active ? "text-brand-300" : ""}`} />
            {label}
            {href === "/inbox" && waiting > 0 && (
              <span className="ml-auto rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white">
                {waiting}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import {
  BookOpen,
  Bot,
  LayoutDashboard,
  Plug,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN: Item[] = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/connect", label: "Connect website", icon: Sparkles },
  { href: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/dashboard/calls", label: "Calls & analytics", icon: LayoutDashboard },
];

export function SidebarNav({ owner, platformAdmin }: { owner: boolean; platformAdmin: boolean }) {
  const pathname = usePathname();
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
          </Link>
        );
      })}
    </nav>
  );
}

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
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

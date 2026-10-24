import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/features/ui/Logo";
import { SidebarNav } from "@/features/ui/SidebarNav";
import { SignOutButton } from "@/features/ui/SignOutButton";
import { currentUser } from "@/server/auth";

// The signed-in app: a dark sidebar with the sections, the business and the person, and the page.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-hidden bg-ink px-4 py-5">
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="relative px-1">
          <Logo href="/agents" light />
        </div>
        <div className="relative mt-7 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <div className="text-[11px] tracking-wider text-slate-500 uppercase">Business</div>
          <div className="truncate text-sm font-medium text-white">{user.businessName}</div>
        </div>
        <div className="relative mt-6 flex-1">
          <SidebarNav owner={user.role === "owner"} platformAdmin={user.isPlatformAdmin} />
        </div>
        <div className="relative flex items-center gap-3 border-t border-white/10 pt-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-xs font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.name}</div>
            <div className="truncate text-xs text-slate-400 capitalize">
              {user.isPlatformAdmin ? "Platform admin" : user.role}
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-10">{children}</main>
    </div>
  );
}

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
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-slate-900 px-4 py-5">
        <Logo href="/agents" light />
        <div className="mt-6 rounded-lg bg-white/5 px-3 py-2">
          <div className="text-xs text-slate-400">Business</div>
          <div className="truncate text-sm font-medium text-white">{user.businessName}</div>
        </div>
        <div className="mt-6 flex-1">
          <SidebarNav owner={user.role === "owner"} platformAdmin={user.isPlatformAdmin} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 pt-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
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
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}

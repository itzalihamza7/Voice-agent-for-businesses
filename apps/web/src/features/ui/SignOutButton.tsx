"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      title="Sign out"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

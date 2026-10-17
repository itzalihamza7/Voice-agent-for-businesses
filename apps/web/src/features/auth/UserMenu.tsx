"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Who is signed in, a link to settings (owners), and signing out.
export function UserMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  return (
    <span className="flex items-center gap-3 text-sm text-gray-600" data-testid="user-menu">
      <span>
        {name} <span className="text-gray-400">({role})</span>
      </span>
      {role === "owner" && (
        <Link href="/settings" className="text-blue-600 underline">
          Settings
        </Link>
      )}
      <button type="button" onClick={() => void logout()} className="text-blue-600 underline">
        Sign out
      </button>
    </span>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Row {
  id: string;
  name: string;
  createdAt: string;
  suspended: boolean;
  owner: string | null;
  users: number;
  agents: number;
  calls30d: number;
  aiCost30d: number;
}

export function BusinessesTable({
  businesses,
  ownBusinessId,
}: {
  businesses: Row[];
  ownBusinessId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = businesses.filter((b) =>
    `${b.name} ${b.owner ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function toggle(business: Row) {
    if (!business.suspended && !confirm(`Suspend ${business.name}?`)) return;
    setPending(business.id);
    await fetch(`/api/admin/businesses/${business.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suspended: !business.suspended }),
    });
    setPending(null);
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-4">
        <input
          aria-label="Search businesses"
          className="input max-w-xs"
          placeholder="Search by name or owner"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 text-right font-medium">Users</th>
              <th className="px-4 py-3 text-right font-medium">Agents</th>
              <th className="px-4 py-3 text-right font-medium">Calls</th>
              <th className="px-4 py-3 text-right font-medium">AI cost</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{b.name}</div>
                  <div className="text-xs text-slate-400">
                    Joined {new Date(b.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{b.owner ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{b.users}</td>
                <td className="px-4 py-3 text-right tabular-nums">{b.agents}</td>
                <td className="px-4 py-3 text-right tabular-nums">{b.calls30d}</td>
                <td className="px-4 py-3 text-right tabular-nums">${b.aiCost30d.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {b.suspended ? (
                    <span className="badge bg-red-50 text-red-700">Suspended</span>
                  ) : (
                    <span className="badge bg-emerald-50 text-emerald-700">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {b.id !== ownBusinessId && (
                    <button
                      type="button"
                      className={
                        b.suspended ? "btn-secondary" : "btn-ghost text-red-600 hover:bg-red-50"
                      }
                      disabled={pending === b.id}
                      onClick={() => void toggle(b)}
                    >
                      {b.suspended ? "Reactivate" : "Suspend"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

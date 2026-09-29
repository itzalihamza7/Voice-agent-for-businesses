"use client";

import { useEffect, useState } from "react";

// The number callers dial to reach this agent (phone calls go through the voice gateway).

export function PhoneNumber({ agentId }: { agentId: string }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/${agentId}/phone`)
      .then((r) => r.json() as Promise<{ phoneNumber?: string | null }>)
      .then((body) => {
        if (cancelled) return;
        setValue(body.phoneNumber ?? "");
        setSaved(body.phoneNumber ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  async function save() {
    const phoneNumber = value.trim() || null;
    const response = await fetch(`/api/agents/${agentId}/phone`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber }),
    });
    const body = (await response.json()) as { error?: string; issues?: { message: string }[] };
    if (!response.ok) {
      setError(body.issues?.[0]?.message ?? body.error ?? "Couldn't save.");
      return;
    }
    setError(null);
    setSaved(value.trim());
  }

  return (
    <span
      className="flex items-center gap-1 text-sm"
      title={error ?? "The number that reaches this agent"}
    >
      <span aria-hidden>📞</span>
      <input
        aria-label="Phone number"
        placeholder="+441632960000"
        className={`w-36 rounded border px-1 py-0.5 ${error ? "border-red-500" : "border-gray-300"}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        onBlur={() => value.trim() !== saved && void save()}
      />
    </span>
  );
}

"use client";

import type { AgentConfig } from "@voice-agent/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// Creates an agent through the API, then opens it in the builder.
export function CreateAgentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      setError(`Could not create the agent (HTTP ${response.status}).`);
      setPending(false);
      return;
    }
    const { agent } = (await response.json()) as { agent: AgentConfig };
    router.push(`/agents/${agent.agentId}/builder`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex gap-2">
      <input
        aria-label="New agent name"
        placeholder="e.g. Pizza order line"
        className="flex-1 rounded border border-gray-300 px-3 py-2"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        type="submit"
        disabled={pending || name.trim() === ""}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create agent"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

"use client";

import type { AgentConfig } from "@voice-agent/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Describe an agent in plain English; a language model designs its flow, then the builder opens.
export function GenerateAgentForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [state, setState] = useState<{ pending?: boolean; error?: string }>({});

  async function generate() {
    setState({ pending: true });
    const response = await fetch("/api/agents/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const body = (await response.json()) as { agent?: AgentConfig; error?: string };
    if (!body.agent) {
      setState({ error: body.error ?? `HTTP ${response.status}` });
      return;
    }
    router.push(`/agents/${body.agent.agentId}/builder`);
  }

  return (
    <div className="mt-4 space-y-2 rounded border border-gray-200 p-3" data-testid="generate-agent">
      <label className="block text-sm font-medium" htmlFor="agent-description">
        Or describe the agent and let AI draft the flow
      </label>
      <textarea
        id="agent-description"
        rows={3}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder="A phone agent for Luigi's Pizza that takes delivery orders: what pizza, size, address and phone number, answers questions about the menu, and passes complaints to the manager on +441632960123."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={description.trim().length < 20 || state.pending}
          onClick={() => void generate()}
          className="rounded bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {state.pending ? "Designing the flow…" : "Generate agent"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </div>
  );
}

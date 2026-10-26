"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Deletes an agent after the person confirms by name what goes with it. */
export function DeleteAgentButton({ agentId, name }: { agentId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function remove() {
    if (
      !confirm(
        `Delete "${name}"? Its versions, evals, website chat and call history are deleted too, and its phone number is freed. This can't be undone.`,
      )
    )
      return;
    setPending(true);
    const response = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      alert("The agent couldn't be deleted.");
      return;
    }
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={pending}
      aria-label={`Delete ${name}`}
      title="Delete agent"
      className="absolute right-3 bottom-3 rounded-lg p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

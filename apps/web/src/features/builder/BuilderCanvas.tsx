import type { AgentFlow } from "@voice-agent/shared";

// Placeholder for the drag-and-drop flow canvas (planned: React Flow).
// It will edit an AgentFlow and save it through /api/agents/:agentId/versions.
// Node palette and node settings panel will live next to this file.
export function BuilderCanvas({ flow }: { flow?: AgentFlow }) {
  return (
    <div className="mt-4 flex h-96 items-center justify-center rounded border border-dashed border-gray-300 text-gray-500">
      Flow canvas goes here ({flow?.nodes.length ?? 0} nodes)
    </div>
  );
}

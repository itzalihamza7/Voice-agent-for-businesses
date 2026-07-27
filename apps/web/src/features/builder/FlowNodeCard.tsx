"use client";

import { BRANCH_ELSE_HANDLE } from "@voice-agent/shared";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { createContext, useContext, useEffect } from "react";
import { toFlowNode, type BuilderNode } from "./flow-mapping";
import { NODE_CATALOG, nodeSummary } from "./node-catalog";

// How every node looks on the canvas. Inputs are on top, outputs at the bottom.
// Start has no input; End and Transfer have no output; Branch has one output per path.

/** Ids of nodes that currently have validation issues (highlighted in red). */
export const NodeIssuesContext = createContext<ReadonlySet<string>>(new Set());

export function FlowNodeCard({ id, type, data, selected }: NodeProps<BuilderNode>) {
  const node = toFlowNode({ id, type, data, position: { x: 0, y: 0 } });
  const kind = NODE_CATALOG[node.type];
  const hasIssues = useContext(NodeIssuesContext).has(id);
  const branchOutputs =
    node.type === "branch"
      ? [
          ...node.data.conditions.map((c) => ({ id: c.id, label: c.label || "…" })),
          { id: BRANCH_ELSE_HANDLE, label: "Otherwise" },
        ]
      : [];

  // React Flow caches handle positions; refresh them when a Branch gains or loses paths.
  const updateNodeInternals = useUpdateNodeInternals();
  const outputKey = branchOutputs.map((output) => output.id).join(",");
  useEffect(() => updateNodeInternals(id), [outputKey, id, updateNodeInternals]);

  return (
    <div
      data-testid={`node-${node.type}`}
      className={`w-56 rounded-md border-2 px-3 py-2 text-left shadow-sm ${kind.accent} ${
        selected ? "ring-2 ring-blue-400" : ""
      } ${hasIssues ? "outline-2 outline-offset-2 outline-red-500" : ""}`}
    >
      {node.type !== "start" && <Handle type="target" position={Position.Top} />}
      <div className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
        {kind.label}
      </div>
      <div className="mt-1 line-clamp-2 min-h-5 text-sm text-gray-900">
        {nodeSummary(node) || <span className="text-gray-400 italic">Not set up yet</span>}
      </div>

      {branchOutputs.length > 0 ? (
        <div className="mt-2 -mb-2 flex gap-1 text-[10px] text-gray-600">
          {branchOutputs.map((output) => (
            // Each output's handle sits at the bottom centre of its own label. Only the text is
            // truncated: overflow-hidden on this box would clip the handle and make it hard to grab.
            <div key={output.id} className="relative min-w-0 flex-1 pb-3 text-center">
              <span className="block truncate">{output.label}</span>
              <Handle id={output.id} type="source" position={Position.Bottom} />
            </div>
          ))}
        </div>
      ) : (
        node.type !== "end" &&
        node.type !== "transfer" && <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

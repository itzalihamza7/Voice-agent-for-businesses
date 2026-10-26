"use client";

import type { FlowNodeType } from "@voice-agent/shared";
import { NODE_CATALOG, PALETTE_TYPES } from "./node-catalog";

// The list of steps you can add: drag one onto the canvas, or click to add it below the
// selected step.

export const DRAG_MIME_TYPE = "application/x-voice-agent-node";

export function NodePalette({ onAdd }: { onAdd: (type: FlowNodeType) => void }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">Steps</h2>
      {PALETTE_TYPES.map((type) => {
        const kind = NODE_CATALOG[type];
        return (
          <button
            key={type}
            type="button"
            draggable
            data-testid={`palette-${type}`}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME_TYPE, type);
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(type)}
            className={`block w-full cursor-grab rounded-lg border-l-4 px-2 py-1.5 text-left ${kind.accent}`}
            title={kind.description}
          >
            <span className="text-sm font-medium">{kind.label}</span>
            <span className="block text-xs text-slate-500">{kind.description}</span>
          </button>
        );
      })}
    </div>
  );
}

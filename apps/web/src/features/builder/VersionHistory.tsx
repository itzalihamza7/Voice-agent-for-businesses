"use client";

import type { AgentConfig } from "@voice-agent/shared";

// Saved versions, newest first. Opening one loads it into the canvas; saving then
// creates a new version from it (old versions are never changed).

interface Props {
  versions: AgentConfig[];
  openVersion: number;
  onOpen: (version: AgentConfig) => void;
}

export function VersionHistory({ versions, openVersion, onOpen }: Props) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold text-gray-700">Versions</h2>
      <ul className="space-y-1">
        {[...versions].reverse().map((version) => (
          <li key={version.version}>
            <button
              type="button"
              onClick={() => onOpen(version)}
              className={`w-full rounded px-2 py-1 text-left text-sm ${
                version.version === openVersion ? "bg-blue-100 font-medium" : "hover:bg-gray-100"
              }`}
            >
              v{version.version} · {version.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import type { AgentTools, ToolInfo } from "@voice-agent/shared";
import { useEffect, useState } from "react";

// Loads every tool the agent can use (built-in, webhooks, MCP servers) from POST /api/tools.
// Reloads half a second after the tool settings stop changing (MCP servers are connected live).
export function useToolList(config: AgentTools) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const key = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: key,
      })
        .then(
          (response) =>
            response.json() as Promise<{ tools?: ToolInfo[]; problems?: string[]; error?: string }>,
        )
        .then((body) => {
          if (cancelled) return;
          setTools(body.tools ?? []);
          setProblems(body.problems ?? (body.error ? [body.error] : []));
        })
        .catch(() => {
          if (!cancelled) setProblems(["Could not load the tool list."]);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return { tools, problems };
}

/** The argument names of a tool, with whether each is required and its description. */
export function toolParameters(tool: ToolInfo) {
  const properties = (tool.parameters.properties ?? {}) as Record<
    string,
    { description?: string; type?: unknown; enum?: unknown[] }
  >;
  const required = new Set(
    Array.isArray(tool.parameters.required) ? (tool.parameters.required as string[]) : [],
  );
  return Object.entries(properties).map(([name, schema]) => ({
    name,
    required: required.has(name),
    description:
      schema.description ??
      (schema.enum ? `one of: ${schema.enum.join(", ")}` : String(schema.type ?? "")),
  }));
}

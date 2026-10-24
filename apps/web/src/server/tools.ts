import { resolveTools } from "@voice-agent/tools";
import { DEFAULT_AGENT_TOOLS, type AgentTools } from "@voice-agent/shared";
import { businessConnectionTools, networkOptions } from "./connections";

// Server-only: loads an agent's tools for one request: built-in tools, the agent's webhooks and
// MCP servers, and the actions of its business's connections (its own apps' APIs).
// Private network addresses are blocked (SSRF guard) unless TOOLS_ALLOW_PRIVATE_HOSTS=true,
// which DDEV sets for local development so the demo MCP server on this machine can be used.
export async function loadTools(config: AgentTools | undefined, businessId: string) {
  const resolved = await resolveTools(config ?? DEFAULT_AGENT_TOOLS, networkOptions());
  for (const tool of await businessConnectionTools(businessId)) {
    if (resolved.tools.has(tool.name))
      resolved.problems.push(`Two tools are called "${tool.name}".`);
    else resolved.tools.set(tool.name, tool);
  }
  return resolved;
}

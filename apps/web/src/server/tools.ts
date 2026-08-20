import { resolveTools } from "@voice-agent/tools";
import { DEFAULT_AGENT_TOOLS, type AgentTools } from "@voice-agent/shared";

// Server-only: loads an agent's tools (built-in, webhook, MCP) for one request.
// Private network addresses are blocked (SSRF guard) unless TOOLS_ALLOW_PRIVATE_HOSTS=true,
// which DDEV sets for local development so the demo MCP server on this machine can be used.
export function loadTools(config: AgentTools | undefined) {
  return resolveTools(config ?? DEFAULT_AGENT_TOOLS, {
    allowPrivateHosts: process.env.TOOLS_ALLOW_PRIVATE_HOSTS === "true",
  });
}

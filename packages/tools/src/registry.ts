import type { AgentTools, ToolInfo } from "@voice-agent/shared";
import { BOOKING_TOOLS } from "./builtin/booking";
import { connectMcpServer, type McpConnection } from "./mcp";
import type { Tool } from "./types";
import { webhookTool, type NetworkOptions } from "./webhook";

// All tools an agent can use right now: built-in tools, its webhooks, and the tools of its MCP
// servers (connected live). Call close() when done, to disconnect from MCP servers.

export interface ResolvedTools {
  tools: Map<string, Tool>;
  /** Why a webhook or MCP server isn't available, e.g. the server couldn't be reached. */
  problems: string[];
  close(): Promise<void>;
}

export const BUILT_IN_TOOLS: readonly Tool[] = BOOKING_TOOLS;

export async function resolveTools(
  config: AgentTools,
  options: NetworkOptions,
): Promise<ResolvedTools> {
  const tools = new Map<string, Tool>();
  const problems: string[] = [];
  const connections: McpConnection[] = [];
  const add = (tool: Tool) => {
    if (tools.has(tool.name))
      problems.push(`Two tools are called "${tool.name}": only the first is used.`);
    else tools.set(tool.name, tool);
  };

  BUILT_IN_TOOLS.forEach(add);
  config.webhooks.forEach((webhook) => add(webhookTool(webhook, options)));
  await Promise.all(
    config.mcpServers.map(async (server) => {
      try {
        const connection = await connectMcpServer(server, options);
        connections.push(connection);
        connection.tools.forEach(add);
      } catch (error) {
        problems.push(
          `MCP server "${server.name}" isn't available: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  return {
    tools,
    problems,
    close: async () => {
      await Promise.allSettled(connections.map((connection) => connection.close()));
    },
  };
}

/** The part of a tool the builder shows (no execute function). */
export function toolInfo({ name, description, parameters, source, resultFields }: Tool): ToolInfo {
  return { name, description, parameters, source, ...(resultFields ? { resultFields } : {}) };
}

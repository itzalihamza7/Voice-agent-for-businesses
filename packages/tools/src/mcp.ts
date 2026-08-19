import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServer } from "@voice-agent/shared";
import { assertPublicUrl } from "./network";
import type { Tool, ToolResult } from "./types";
import type { NetworkOptions } from "./webhook";

// Tools from an MCP (Model Context Protocol) server, over Streamable HTTP. We connect, ask the
// server which tools it has (listTools), and wrap each one as a Tool. Tool names get the
// server's name as a prefix, e.g. "demo" + "convert_currency" → demo_convert_currency.

export interface McpConnection {
  tools: Tool[];
  close(): Promise<void>;
}

export async function connectMcpServer(
  server: McpServer,
  options: NetworkOptions,
): Promise<McpConnection> {
  await assertPublicUrl(server.url, options);
  const client = new Client({ name: "voice-agent-platform", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
  const { tools } = await client.listTools();

  return {
    tools: tools.map((tool) => ({
      name: `${server.name}_${tool.name}`.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 64),
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
      source: "mcp" as const,
      async execute(args): Promise<ToolResult> {
        try {
          const result = await client.callTool({ name: tool.name, arguments: args });
          const content = Array.isArray(result.content) ? result.content : [];
          const text = content
            .map((part) => (part.type === "text" ? String(part.text) : `[${String(part.type)}]`))
            .join("\n");
          if (result.isError)
            return { ok: false, error: text || "The MCP tool reported an error." };
          // Prefer structured content; otherwise use the text (parsed if it is a JSON object).
          if (result.structuredContent && typeof result.structuredContent === "object") {
            return { ok: true, data: result.structuredContent as Record<string, unknown> };
          }
          return { ok: true, data: parseObject(text) ?? { text } };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    })),
    close: () => client.close(),
  };
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

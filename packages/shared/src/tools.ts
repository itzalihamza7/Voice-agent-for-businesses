import { z } from "zod";

// Tools an agent can use: built-in ones (always available), webhooks (the business's own URL)
// and MCP servers (any Model Context Protocol server; its tools are discovered when connecting).

// Tool names become function names for the language model: letters, digits and underscores.
export const ToolNameSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "Use letters, digits and _ (start with a letter).");

/** A JSON Schema for a tool's arguments. Must describe an object. */
export const ToolParametersSchema = z
  .record(z.string(), z.unknown())
  .refine((schema) => schema.type === "object", 'The schema must have "type": "object".');

export const WebhookToolSchema = z.object({
  name: ToolNameSchema,
  description: z.string(),
  url: z.url({ protocol: /^https?$/ }),
  parameters: ToolParametersSchema,
});

export const McpServerSchema = z.object({
  // Prefix for the server's tools, e.g. "weather" → weather_get_forecast.
  name: ToolNameSchema,
  url: z.url({ protocol: /^https?$/ }),
});

export const AgentToolsSchema = z.object({
  webhooks: z.array(WebhookToolSchema).max(20),
  mcpServers: z.array(McpServerSchema).max(5),
});

export type WebhookTool = z.infer<typeof WebhookToolSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type AgentTools = z.infer<typeof AgentToolsSchema>;

export const DEFAULT_AGENT_TOOLS: AgentTools = { webhooks: [], mcpServers: [] };

/** What the builder shows about an available tool. */
export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  source: "builtin" | "webhook" | "mcp" | "connection";
  /** For built-in tools: the fields of a successful result, usable as {{saveAs_field}}. */
  resultFields?: string[];
}

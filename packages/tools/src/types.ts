import type { ToolInfo } from "@voice-agent/shared";

// A tool the agent can call: built-in, a webhook, or a tool from an MCP server.

export type ToolResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export interface ToolContext {
  /** The current time (injectable, so tests are repeatable). */
  now: Date;
  /** The number the call comes from, when known (phone calls). Tools may bind values to it. */
  callerPhone?: string | null;
}

export interface Tool extends ToolInfo {
  /** Arguments are already checked against `parameters` (see checkArguments). */
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

import type { WebhookTool } from "@voice-agent/shared";
import { assertPublicUrl, type HostLookup } from "./network";
import type { Tool, ToolResult } from "./types";

// A tool backed by the business's own URL. We POST { "arguments": {...} } as JSON and expect a
// JSON object back, which becomes the tool's result.

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 100_000;

export interface NetworkOptions {
  allowPrivateHosts: boolean;
  fetch?: typeof fetch;
  lookup?: HostLookup;
}

export function webhookTool(config: WebhookTool, options: NetworkOptions): Tool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    source: "webhook",
    async execute(args): Promise<ToolResult> {
      try {
        await assertPublicUrl(config.url, options);
        const response = await (options.fetch ?? fetch)(config.url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ arguments: args }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          // A redirect could point at a private address after the check: don't follow it.
          redirect: "manual",
        });
        if (response.status >= 300 && response.status < 400) {
          return {
            ok: false,
            error: "The webhook answered with a redirect, which isn't followed.",
          };
        }
        const text = await response.text();
        if (!response.ok)
          return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        if (text.length > MAX_RESPONSE_BYTES)
          return { ok: false, error: "The response is too large." };
        const data: unknown = JSON.parse(text);
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          return { ok: false, error: "The webhook must answer with a JSON object." };
        }
        return { ok: true, data: data as Record<string, unknown> };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

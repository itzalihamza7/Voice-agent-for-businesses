"use client";

import {
  McpServerSchema,
  WebhookToolSchema,
  type AgentTools,
  type ToolInfo,
  type WebhookTool,
} from "@voice-agent/shared";
import { useState } from "react";
import { toolParameters } from "./tool-list";

// The Tools tab: the agent's webhook tools and MCP servers, plus the built-in tools.
// Saved with the agent's next version, like the flow and the prompt.

interface Props {
  config: AgentTools;
  onChange: (config: AgentTools) => void;
  /** Every tool available right now (from /api/tools), to show what each MCP server offers. */
  available: ToolInfo[];
  problems: string[];
}

const EXAMPLE_PARAMETERS = JSON.stringify(
  { type: "object", required: ["orderId"], properties: { orderId: { type: "string" } } },
  null,
  2,
);

export function ToolsPanel({ config, onChange, available, problems }: Props) {
  const builtIns = available.filter((tool) => tool.source === "builtin");
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-slate-200">
      <section className="space-y-6 overflow-y-auto p-6" data-testid="tools-editor">
        <div>
          <h2 className="text-lg font-semibold">Webhook tools</h2>
          <p className="text-sm text-slate-500">
            Your own endpoint: we POST {'{ "arguments": {...} }'} as JSON and use the JSON object it
            returns. Private network addresses are blocked unless allowed for local development.
          </p>
          <div className="mt-3 space-y-3">
            {config.webhooks.map((webhook, index) => (
              <WebhookEditor
                key={index}
                index={index}
                webhook={webhook}
                onChange={(next) =>
                  onChange({
                    ...config,
                    webhooks: config.webhooks.map((w, i) => (i === index ? next : w)),
                  })
                }
                onRemove={() =>
                  onChange({ ...config, webhooks: config.webhooks.filter((_, i) => i !== index) })
                }
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-sm text-brand-600 font-medium hover:underline"
            onClick={() =>
              onChange({
                ...config,
                webhooks: [
                  ...config.webhooks,
                  {
                    name: "lookupOrder",
                    description: "Look up an order by its id",
                    url: "https://example.com/hooks/order",
                    parameters: JSON.parse(EXAMPLE_PARAMETERS) as Record<string, unknown>,
                  },
                ],
              })
            }
          >
            + Add webhook tool
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold">MCP servers</h2>
          <p className="text-sm text-slate-500">
            Any Model Context Protocol server (Streamable HTTP). Its tools are listed automatically,
            named <code>server_tool</code>. Try the demo server:{" "}
            <code>http://localhost:3000/api/demo-mcp</code>.
          </p>
          <div className="mt-3 space-y-3">
            {config.mcpServers.map((server, index) => {
              const prefix = `${server.name}_`;
              const tools = available.filter(
                (t) => t.source === "mcp" && t.name.startsWith(prefix),
              );
              const problem = problems.find((p) => p.includes(`"${server.name}"`));
              const valid = McpServerSchema.safeParse(server);
              const update = (next: Partial<typeof server>) =>
                onChange({
                  ...config,
                  mcpServers: config.mcpServers.map((s, i) =>
                    i === index ? { ...s, ...next } : s,
                  ),
                });
              return (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-slate-200 p-3"
                  data-testid="mcp-server"
                >
                  <div className="flex gap-2">
                    <Field
                      label={`MCP server ${index + 1}: name`}
                      value={server.name}
                      onChange={(name) => update({ name })}
                    />
                    <button
                      type="button"
                      aria-label={`Remove MCP server ${index + 1}`}
                      className="self-end pb-1 text-slate-400 hover:text-red-600"
                      onClick={() =>
                        onChange({
                          ...config,
                          mcpServers: config.mcpServers.filter((_, i) => i !== index),
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                  <Field
                    label={`MCP server ${index + 1}: URL`}
                    value={server.url}
                    onChange={(url) => update({ url })}
                  />
                  {!valid.success && (
                    <p className="text-xs text-red-600">{valid.error.issues[0]?.message}</p>
                  )}
                  {problem ? (
                    <p className="text-xs text-red-600">{problem}</p>
                  ) : tools.length > 0 ? (
                    <p className="text-xs text-emerald-700" data-testid="mcp-status">
                      Connected: {tools.map((t) => t.name).join(", ")}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Connecting…</p>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-2 text-sm text-brand-600 font-medium hover:underline"
            onClick={() =>
              onChange({
                ...config,
                mcpServers: [
                  ...config.mcpServers,
                  { name: "demo", url: "http://localhost:3000/api/demo-mcp" },
                ],
              })
            }
          >
            + Add MCP server
          </button>
        </div>
      </section>

      <section className="space-y-3 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold">Built-in tools</h2>
        <p className="text-sm text-slate-500">
          Always available. They use a mock booking system (open Monday–Saturday, 9:00–17:00; demo
          booking reference ABC123), so booking agents can be tested end to end.
        </p>
        {builtIns.map((tool) => (
          <div
            key={tool.name}
            className="rounded-lg border border-slate-200 p-3 text-sm"
            data-testid="builtin-tool"
          >
            <code className="font-semibold">{tool.name}</code>
            <p className="text-slate-600">{tool.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              Arguments:{" "}
              {toolParameters(tool)
                .map((p) => `${p.name}${p.required ? "*" : ""}`)
                .join(", ")}
              {tool.resultFields && ` · Result: ${tool.resultFields.join(", ")}`}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

function WebhookEditor({
  index,
  webhook,
  onChange,
  onRemove,
}: {
  index: number;
  webhook: WebhookTool;
  onChange: (webhook: WebhookTool) => void;
  onRemove: () => void;
}) {
  // The schema is edited as text; it's only applied while it is valid JSON.
  const [schemaText, setSchemaText] = useState(() => JSON.stringify(webhook.parameters, null, 2));
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const valid = WebhookToolSchema.safeParse(webhook);
  const label = (field: string) => `Webhook ${index + 1}: ${field}`;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3" data-testid="webhook-tool">
      <div className="flex gap-2">
        <Field
          label={label("name")}
          value={webhook.name}
          onChange={(name) => onChange({ ...webhook, name })}
        />
        <button
          type="button"
          aria-label={`Remove webhook ${index + 1}`}
          className="self-end pb-1 text-slate-400 hover:text-red-600"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      <Field
        label={label("description")}
        value={webhook.description}
        onChange={(description) => onChange({ ...webhook, description })}
      />
      <Field
        label={label("URL")}
        value={webhook.url}
        onChange={(url) => onChange({ ...webhook, url })}
      />
      <label className="block text-sm">
        <span className="font-medium">{label("arguments (JSON Schema)")}</span>
        <textarea
          aria-label={label("arguments (JSON Schema)")}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs"
          rows={6}
          value={schemaText}
          onChange={(event) => {
            setSchemaText(event.target.value);
            try {
              const parsed: unknown = JSON.parse(event.target.value);
              if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                throw new Error("The schema must be a JSON object.");
              }
              setSchemaError(null);
              onChange({ ...webhook, parameters: parsed as Record<string, unknown> });
            } catch (error) {
              setSchemaError(error instanceof Error ? error.message : "Invalid JSON");
            }
          }}
        />
      </label>
      {(schemaError ?? (!valid.success ? valid.error.issues[0]?.message : null)) && (
        <p className="text-xs text-red-600" data-testid="webhook-error">
          {schemaError ??
            (!valid.success
              ? `${valid.error.issues[0]?.path.join(".")}: ${valid.error.issues[0]?.message}`
              : "")}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block flex-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        aria-label={label}
        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

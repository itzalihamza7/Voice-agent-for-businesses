import type { ConnectionAction } from "@voice-agent/shared";
import { assertPublicUrl } from "./network";
import type { Tool, ToolResult } from "./types";
import type { NetworkOptions } from "./webhook";

// Tools for a connection to a business's own app. Each action is one HTTP request: path
// parameters fill {placeholders}, query parameters go in the query string, body parameters in a
// JSON body. The connection's credential is added as a header. Same safety as webhooks: public
// addresses only (SSRF guard), no redirects, a timeout and a size limit.

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 100_000;

export interface ConnectionConfig {
  slug: string;
  name: string;
  baseUrl: string;
  /** Headers that authenticate every request, e.g. { authorization: "Bearer …" }. */
  authHeaders: Record<string, string>;
  actions: ConnectionAction[];
}

export function connectionTools(connection: ConnectionConfig, options: NetworkOptions): Tool[] {
  return connection.actions.map((action) => connectionTool(connection, action, options));
}

function connectionTool(
  connection: ConnectionConfig,
  action: ConnectionAction,
  options: NetworkOptions,
): Tool {
  const properties = Object.fromEntries(
    action.parameters.map((p) => [p.name, { type: p.type, description: p.description }]),
  );
  return {
    name: `${connection.slug}_${action.name}`,
    description: `${connection.name}: ${action.description}`,
    parameters: {
      type: "object",
      properties,
      required: action.parameters.filter((p) => p.required).map((p) => p.name),
    },
    source: "connection",
    async execute(args): Promise<ToolResult> {
      try {
        const url = requestUrl(connection.baseUrl, action, args);
        await assertPublicUrl(url, options);
        const bodyParams = action.parameters.filter((p) => p.in === "body");
        const fixed = action.fixedBody ?? {};
        const body =
          action.method !== "GET" && (bodyParams.length || Object.keys(fixed).length)
            ? JSON.stringify({
                ...Object.fromEntries(
                  bodyParams
                    .filter((p) => args[p.name] !== undefined)
                    .map((p) => [p.name, args[p.name]]),
                ),
                // Fixed values win over anything the AI sent.
                ...fixed,
              })
            : undefined;
        const response = await (options.fetch ?? fetch)(url, {
          method: action.method,
          headers: {
            accept: "application/json",
            ...(body ? { "content-type": "application/json" } : {}),
            ...connection.authHeaders,
          },
          ...(body ? { body } : {}),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "manual",
        });
        const text = await response.text();
        if (response.status >= 300 && response.status < 400) {
          return { ok: false, error: "The app answered with a redirect, which isn't followed." };
        }
        if (!response.ok)
          return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        if (text.length > MAX_RESPONSE_BYTES)
          return { ok: false, error: "The response is too large." };
        const data: unknown = text ? JSON.parse(text) : {};
        // Tools return objects; a list becomes { items: [...] }.
        if (Array.isArray(data)) return { ok: true, data: { items: data } };
        if (typeof data !== "object" || data === null) return { ok: true, data: { value: data } };
        return { ok: true, data: data as Record<string, unknown> };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** The request URL: base + path with {params} filled in, plus query parameters. */
export function requestUrl(
  baseUrl: string,
  action: ConnectionAction,
  args: Record<string, unknown>,
): string {
  let path = action.path;
  for (const p of action.parameters.filter((p) => p.in === "path")) {
    const value = args[p.name];
    if (value === undefined || value === "") throw new Error(`Missing ${p.name}.`);
    path = path.replace(`{${p.name}}`, encodeURIComponent(String(value)));
  }
  const url = new URL(baseUrl.replace(/\/+$/, "") + path);
  for (const p of action.parameters.filter((p) => p.in === "query")) {
    const value = args[p.name];
    if (value !== undefined && value !== "") url.searchParams.set(p.name, String(value));
  }
  return url.toString();
}

/**
 * Actions from an OpenAPI 3 document (JSON): one per operation, named by its operationId (or
 * method + path), with path/query parameters and the JSON body's top-level properties.
 */
export function actionsFromOpenApi(spec: unknown): {
  baseUrl: string | null;
  actions: ConnectionAction[];
} {
  const doc = spec as {
    servers?: { url?: string }[];
    paths?: Record<string, Record<string, OpenApiOperation>>;
  };
  if (!doc || typeof doc !== "object" || !doc.paths)
    throw new Error("That isn't an OpenAPI document.");
  const actions: ConnectionAction[] = [];
  for (const [path, operations] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(operations)) {
      const upper = method.toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(upper)) continue;
      const name = snake(op.operationId ?? `${method}_${path}`).slice(0, 60);
      const parameters: ConnectionAction["parameters"] = (op.parameters ?? [])
        .filter((p) => p.in === "path" || p.in === "query")
        .map((p) => ({
          name: p.name,
          in: p.in as "path" | "query",
          type: simpleType(p.schema?.type),
          required: p.in === "path" || Boolean(p.required),
          description: p.description ?? "",
        }));
      const body = op.requestBody?.content?.["application/json"]?.schema;
      for (const [prop, schema] of Object.entries(body?.properties ?? {})) {
        parameters.push({
          name: prop,
          in: "body",
          type: simpleType(schema.type),
          required: (body?.required ?? []).includes(prop),
          description: schema.description ?? "",
        });
      }
      actions.push({
        name: /^[A-Za-z]/.test(name) ? name : `op_${name}`,
        description: (op.summary ?? op.description ?? `${upper} ${path}`).slice(0, 500),
        method: upper as ConnectionAction["method"],
        path,
        parameters,
        fixedBody: {},
      });
    }
  }
  return { baseUrl: doc.servers?.[0]?.url ?? null, actions };
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: { type?: string };
  }[];
  requestBody?: {
    content?: Record<
      string,
      {
        schema?: {
          properties?: Record<string, { type?: string; description?: string }>;
          required?: string[];
        };
      }
    >;
  };
}

function simpleType(
  type: string | undefined,
): "string" | "number" | "integer" | "boolean" | "object" {
  return type === "number" || type === "integer" || type === "boolean" || type === "object"
    ? type
    : "string";
}

function snake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

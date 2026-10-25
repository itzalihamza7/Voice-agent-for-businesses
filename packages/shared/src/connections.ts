import { z } from "zod";
import { ToolNameSchema } from "./tools";

// Connections: a business's own app (its shop, booking system, CRM) reached through its API.
// Each action becomes a tool agents can call, named <slug>_<action>, e.g. chafer_check_stock.

export const ConnectionParameterSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, "Letters, digits and _ only."),
  /** Where the value goes: in the path ({sku}), the query string, or the JSON body. */
  in: z.enum(["path", "query", "body"]),
  /** "object": a JSON object, e.g. a place { label, lat, lng } or contact details. */
  type: z.enum(["string", "number", "integer", "boolean", "object"]).default("string"),
  required: z.boolean().default(false),
  description: z.string().max(300).default(""),
  /**
   * Who gives the value. "ai": the model, from the conversation. "caller_phone": the code, from
   * the number the call comes from; the model never sees or sets it, so a caller can't ask for
   * someone else's bookings by saying another number. Absent means "ai".
   */
  source: z.enum(["ai", "caller_phone"]).optional(),
});

export const ConnectionActionSchema = z.object({
  name: ToolNameSchema,
  description: z.string().trim().min(1).max(500),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  /** Relative to the base URL, with {placeholders} for path parameters, e.g. /products/{sku}. */
  path: z.string().trim().regex(/^\//, "Start the path with /."),
  parameters: z.array(ConnectionParameterSchema).max(30).default([]),
  /**
   * Body values set by code, never by the AI, e.g. { acceptTerms: true, paymentMethod:
   * "chauffeur" }: decisions like these belong to the business, not the model.
   */
  fixedBody: z.record(z.string(), z.unknown()).default({}),
  /** True for a POST that only reads (e.g. a lookup). By default only GET counts as reading. */
  readOnly: z.boolean().optional(),
});

export const ConnectionAuthSchema = z.enum(["none", "bearer", "header"]);

export const ConnectionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9]{1,19}$/, "2–20 lowercase letters or digits, starting with a letter."),
  baseUrl: z.url({ protocol: /^https?$/ }),
  authType: ConnectionAuthSchema,
  /** For "header": the header's name, e.g. x-api-key. */
  authHeader: z.string().trim().max(60).nullable().default(null),
  /** The API key or token. Write-only: never sent back. null = keep the stored one. */
  secret: z.string().trim().max(500).nullable().default(null),
  actions: z.array(ConnectionActionSchema).min(1).max(40),
});

export type ConnectionParameter = z.infer<typeof ConnectionParameterSchema>;
export type ConnectionAction = z.infer<typeof ConnectionActionSchema>;
export type ConnectionInput = z.infer<typeof ConnectionInputSchema>;

/** A connection as the UI sees it: everything except the secret. */
export interface ConnectionSummary extends Omit<ConnectionInput, "secret"> {
  id: string;
  hasSecret: boolean;
  updatedAt: string;
  /** Put in a DNS TXT record or a file on the API's domain to prove the business owns it. */
  verificationToken: string;
  verifiedAt: string | null;
  /** May agents change data through it? Only with the API's own key or a verified domain. */
  writesAllowed: boolean;
}

/** True if the action changes data in the business's app (anything but a read). */
export function changesData(action: Pick<ConnectionAction, "method" | "readOnly">): boolean {
  return !(action.readOnly ?? action.method === "GET");
}

/** One request an agent made through a connection, for the audit log. */
export interface ConnectionRequestLog {
  action: string;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  error: string | null;
  latencyMs: number;
}

/** The DNS TXT record value and file path that prove a business owns an API's domain. */
export const VERIFICATION_TXT_PREFIX = "vesper-verify=";
export const VERIFICATION_FILE_PATH = "/.well-known/vesper-verify.txt";

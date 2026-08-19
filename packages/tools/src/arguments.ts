// Checks tool arguments against the tool's JSON Schema before calling it, and turns template
// strings into the right types ("3" → 3 for an integer). Covers the parts of JSON Schema that
// tool parameters use in practice: top-level properties, required, type and enum.

interface PropertySchema {
  type?: string | string[];
  enum?: unknown[];
}

function properties(schema: Record<string, unknown>): Record<string, PropertySchema> {
  return (schema.properties ?? {}) as Record<string, PropertySchema>;
}

/** Required arguments that are missing or empty. */
export function missingArguments(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): string[] {
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required.filter((name) => args[name] === undefined || args[name] === "");
}

export function checkArguments(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const missing = missingArguments(schema, args);
  if (missing.length > 0) return { ok: false, error: `Missing argument(s): ${missing.join(", ")}` };

  const checked: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties(schema))) {
    const value = args[name];
    if (value === undefined || value === "" || value === null) continue;
    const types = Array.isArray(property.type) ? property.type : [property.type ?? "string"];
    const coerced = coerce(value, types);
    if (coerced === undefined) {
      return { ok: false, error: `Argument "${name}" must be ${types.join(" or ")}` };
    }
    if (property.enum && !property.enum.includes(coerced)) {
      return { ok: false, error: `Argument "${name}" must be one of ${property.enum.join(", ")}` };
    }
    checked[name] = coerced;
  }
  // Arguments the schema doesn't know are dropped.
  return { ok: true, args: checked };
}

function coerce(value: unknown, types: string[]): unknown {
  for (const type of types) {
    if (type === "string" && (typeof value === "string" || typeof value === "number")) {
      return String(value);
    }
    if (type === "number" || type === "integer") {
      const number = typeof value === "number" ? value : Number(String(value).trim());
      if (Number.isFinite(number) && (type === "number" || Number.isInteger(number))) return number;
    }
    if (type === "boolean") {
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "false") return value === "true";
    }
    if (
      (type === "array" && Array.isArray(value)) ||
      (type === "object" && typeof value === "object")
    ) {
      return value;
    }
  }
  return undefined;
}

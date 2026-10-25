import { z } from "zod";

// The website chat widget: an agent on the business's own site, opened by one line of script.
// Only the listed hosts (and their subdomains) may show it.

/**
 * "https://www.Example.com/contact" or "example.com" → "example.com". A leading "www." is dropped
 * so the whole site (which includes its subdomains) is allowed.
 */
export function normalizeHost(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  try {
    const host = new URL(/^[a-z]+:\/\//.test(text) ? text : `https://${text}`).hostname;
    if (!/^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(host)) return null;
    return host.startsWith("www.") && host.split(".").length > 2 ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** True if `host` is one of the allowed hosts or a subdomain of one. */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/** The CSP frame-ancestors sources for the allowed hosts (https only, subdomains included). */
export function frameAncestors(allowed: readonly string[]): string[] {
  return allowed.flatMap((h) =>
    h === "localhost" ? ["http://localhost:*"] : [`https://${h}`, `https://*.${h}`],
  );
}

export const WidgetSettingsSchema = z.object({
  enabled: z.boolean(),
  allowedHosts: z
    .array(z.string())
    .max(20)
    .transform((hosts, ctx) => {
      const out: string[] = [];
      for (const h of hosts) {
        if (!h.trim()) continue;
        const host = normalizeHost(h);
        if (!host) {
          ctx.addIssue({ code: "custom", message: `"${h}" isn't a website address.` });
          return z.NEVER;
        }
        if (!out.includes(host)) out.push(host);
      }
      return out;
    }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #6d43f5."),
  title: z.string().trim().max(60).nullable(),
  dailyCostCapUsd: z.number().min(0.1).max(100),
});

export type WidgetSettingsInput = z.input<typeof WidgetSettingsSchema>;
export type WidgetSettings = z.output<typeof WidgetSettingsSchema>;

export interface WidgetSummary extends WidgetSettings {
  publicId: string;
}

/** What the chat window needs to know (public). */
export interface WidgetPublicConfig {
  title: string;
  color: string;
}

/** A visitor's message. The token proves the chat is theirs. */
export const WidgetMessageSchema = z.object({
  token: z.string().min(10).max(200),
  text: z.string().trim().min(1).max(1000),
});

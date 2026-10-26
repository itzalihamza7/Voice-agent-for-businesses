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

/** A phone number in international format, or empty for "not offered". */
const optionalPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine(
    (v) => v === "" || /^\+[1-9][0-9]{6,14}$/.test(v),
    "Use the international format, e.g. +34600111222.",
  )
  .transform((v) => (v === "" ? null : v))
  .nullable();

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
  /** Visitors can continue on WhatsApp, with the chat's reference and question. */
  whatsappNumber: optionalPhone.default(null),
  /** Visitors can call (or ask to be called back), quoting the chat's reference. */
  phoneNumber: optionalPhone.default(null),
  /** Visitors can ask for a person, who answers from the Inbox. */
  liveChat: z.boolean().default(true),
  /** The team's WhatsApp number for alerts about hand-offs. */
  alertWhatsapp: optionalPhone.default(null),
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
  /** Ways to reach the team. Numbers are the business's public contact numbers. */
  whatsappNumber: string | null;
  phoneNumber: string | null;
  liveChat: boolean;
}

/** How a visitor asks to reach the team. */
export const HANDOFF_CHANNELS = ["person", "whatsapp", "call", "callback"] as const;
export type HandoffChannel = (typeof HANDOFF_CHANNELS)[number];

export const HandoffRequestSchema = z.object({
  token: z.string().min(10).max(200),
  channel: z.enum(HANDOFF_CHANNELS),
  name: z.string().trim().max(80).optional(),
  /** For "callback": the number (or email) to reach the visitor. */
  contact: z.string().trim().max(120).optional(),
});

/** One message as the visitor and the team see it. */
export interface WebChatMessageView {
  id: string;
  sender: "visitor" | "agent" | "staff" | "system";
  text: string;
  author: string | null;
  at: string;
}

/** A visitor's chat: its messages and whether a person has taken over. */
export interface WebChatView {
  id: string;
  title: string | null;
  mode: "bot" | "waiting" | "live";
  /** The flow has ended: the AI won't answer again (a person still can). */
  ended: boolean;
  reference: string | null;
  handoff: HandoffChannel | null;
  messages: WebChatMessageView[];
}

/** A visitor's message. The token proves the chat is theirs. */
export const WidgetMessageSchema = z.object({
  token: z.string().min(10).max(200),
  text: z.string().trim().min(1).max(1000),
});

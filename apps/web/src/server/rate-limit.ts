// Rate limits: a fixed window per key (user or IP) and kind of request, kept in memory. Enough
// for one server; with several, move the counters to Redis or Postgres.

export interface Limit {
  requests: number;
  windowMs: number;
}

/**
 * Requests that call models (they cost money), sign-in attempts (they guess passwords), and
 * website visitors' chats (anonymous, so counted per IP address).
 */
export const LIMITS: Record<"ai" | "login" | "widgetChat" | "widgetMessage", Limit> = {
  ai: { requests: 120, windowMs: 60_000 },
  login: { requests: 10, windowMs: 60_000 },
  widgetChat: { requests: 20, windowMs: 3_600_000 },
  widgetMessage: { requests: 20, windowMs: 60_000 },
};

/** The widget limit a public request falls under, if any. */
export function widgetLimitFor(
  pathname: string,
  method: string,
): "widgetChat" | "widgetMessage" | null {
  if (method !== "POST" || !pathname.startsWith("/api/widget/")) return null;
  return /^\/api\/widget\/[^/]+\/chats$/.test(pathname) ? "widgetChat" : "widgetMessage";
}

const windows = new Map<string, { start: number; count: number }>();

/** Counts a request. Returns how many seconds to wait if over the limit, else null. */
export function hit(key: string, limit: Limit, now = Date.now()): number | null {
  const current = windows.get(key);
  if (!current || now - current.start >= limit.windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) prune(now, limit.windowMs);
    return null;
  }
  current.count++;
  return current.count > limit.requests
    ? Math.ceil((current.start + limit.windowMs - now) / 1000)
    : null;
}

function prune(now: number, windowMs: number) {
  for (const [key, value] of windows) if (now - value.start >= windowMs) windows.delete(key);
}

const AI_ROUTES = [
  "/api/test-calls",
  "/api/voice/",
  "/api/simulate",
  "/api/prompt-playground",
  "/api/agents/generate",
  "/api/knowledge/search",
  "/api/knowledge/retrieval-eval",
  "/api/knowledge/documents",
];

/** Which limit a request falls under, if any. */
export function limitFor(pathname: string, method: string): keyof typeof LIMITS | null {
  if (pathname === "/api/auth/login") return "login";
  if (method === "GET") return null;
  if (AI_ROUTES.some((p) => pathname.startsWith(p)) || /\/evals\/runs\//.test(pathname))
    return "ai";
  return null;
}

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/server/auth";
import { hit, LIMITS, limitFor, widgetLimitFor } from "@/server/rate-limit";
import { frameAncestors } from "@voice-agent/shared";
import { widgetHosts } from "@/server/widget";

// Runs before every page and API request: checks the session, applies roles, and passes the
// user's business on to server code in the x-business-id header (never trusted from the client).
//   - viewer: can look at everything and run test calls;
//   - editor: can change agents, knowledge and evals;
//   - owner: can also manage users, the business's API keys and its app connections.
// Phone routes authenticate with the gateway's secret instead; the demo MCP server is public.
// The website widget (its script, chat window and chat API) is public too: visitors are counted
// per IP, and the chat window may only be framed by the business's allowed sites.
// AI-heavy requests and sign-in attempts are rate limited (server/rate-limit.ts).

const PUBLIC = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/phone/",
  "/api/demo-mcp",
  "/api/health",
  "/widget.js",
  "/embed/",
  "/api/widget/",
];
/** Platform admins only. */
const ADMIN_ONLY = ["/admin", "/api/admin/"];
const VIEWER_WRITES = [
  "/api/test-calls",
  "/api/voice/",
  "/api/simulate",
  "/api/prompt-playground",
  "/api/knowledge/search",
  "/api/knowledge/retrieval-eval",
  "/api/auth/logout",
];
const OWNER_ONLY = ["/api/business/", "/settings", "/api/connections", "/connections"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const forwarded = new Headers(request.headers);
  forwarded.delete("x-business-id");
  forwarded.delete("x-user-role");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (pathname === "/api/auth/login" || pathname === "/api/auth/signup") {
    const wait = hit(`login:${ip}`, LIMITS.login);
    if (wait) return tooMany(wait);
  }
  const widgetLimit = widgetLimitFor(pathname, request.method);
  if (widgetLimit) {
    const wait = hit(`${widgetLimit}:${ip}`, LIMITS[widgetLimit]);
    if (wait) return tooMany(wait);
  }
  if (pathname.startsWith("/embed/")) return embedPage(pathname, forwarded);
  if (matches(pathname, PUBLIC)) return NextResponse.next({ request: { headers: forwarded } });

  const api = pathname.startsWith("/api/");
  const user = await userForToken(request.cookies.get(SESSION_COOKIE)?.value);
  // The landing page is public; signed-in people go straight to their agents.
  if (pathname === "/") {
    return user && !user.suspended
      ? NextResponse.redirect(new URL("/agents", request.url))
      : NextResponse.next({ request: { headers: forwarded } });
  }
  if (user?.suspended && !user.isPlatformAdmin) {
    return api
      ? NextResponse.json({ error: "This account is suspended." }, { status: 403 })
      : NextResponse.redirect(new URL("/login?suspended=1", request.url));
  }
  if (!user) {
    if (api) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const writing = request.method !== "GET" && request.method !== "HEAD";
  const forbidden =
    (matches(pathname, ADMIN_ONLY) && !user.isPlatformAdmin) ||
    (matches(pathname, OWNER_ONLY) && user.role !== "owner") ||
    (writing && user.role === "viewer" && !matches(pathname, VIEWER_WRITES));
  if (forbidden) {
    return api
      ? NextResponse.json({ error: "Your role doesn't allow this." }, { status: 403 })
      : NextResponse.redirect(new URL("/agents", request.url));
  }

  const kind = limitFor(pathname, request.method);
  if (kind && kind !== "login") {
    const wait = hit(`${kind}:${user.userId}`, LIMITS[kind]);
    if (wait) return tooMany(wait);
  }

  forwarded.set("x-business-id", user.businessId);
  forwarded.set("x-user-role", user.role);
  return NextResponse.next({ request: { headers: forwarded } });
}

/** The widget's chat window, framable only by this app and the widget's allowed sites. */
async function embedPage(pathname: string, forwarded: Headers) {
  const publicId = decodeURIComponent(pathname.split("/")[2] ?? "");
  const hosts = (await widgetHosts(publicId)) ?? [];
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set(
    "content-security-policy",
    `frame-ancestors ${["'self'", ...frameAncestors(hosts)].join(" ")}`,
  );
  return response;
}

function tooMany(seconds: number) {
  return NextResponse.json(
    { error: `Too many requests. Try again in ${seconds} s.` },
    { status: 429, headers: { "retry-after": String(seconds) } },
  );
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg).*)"],
};

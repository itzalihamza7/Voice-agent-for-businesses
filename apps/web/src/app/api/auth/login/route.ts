// POST /api/auth/login { email, password }: signs in and sets the session cookie.
import { z } from "zod";
import { SESSION_COOKIE, signIn } from "@/server/auth";
import { parseJsonBody } from "@/server/http";

const LoginSchema = z.object({ email: z.string().trim().min(3), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, LoginSchema);
  if ("response" in parsed) return parsed.response;
  const token = await signIn(parsed.data.email, parsed.data.password);
  if (!token) return Response.json({ error: "Wrong email or password." }, { status: 401 });
  const response = Response.json({ ok: true });
  // Behind a proxy (Caddy) the app sees plain HTTP; the proxy says what the browser used.
  const https =
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:";
  const secure = https ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 86400}${secure}`,
  );
  return response;
}

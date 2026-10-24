// POST /api/auth/login { email, password }: signs in and sets the session cookie.
import { z } from "zod";
import { sessionCookie, signIn } from "@/server/auth";
import { parseJsonBody } from "@/server/http";

const LoginSchema = z.object({ email: z.string().trim().min(3), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, LoginSchema);
  if ("response" in parsed) return parsed.response;
  const token = await signIn(parsed.data.email, parsed.data.password);
  if (!token) return Response.json({ error: "Wrong email or password." }, { status: 401 });
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", sessionCookie(token, request));
  return response;
}

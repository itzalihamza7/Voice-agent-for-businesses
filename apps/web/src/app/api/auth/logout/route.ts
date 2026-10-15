// POST /api/auth/logout: ends the session.
import { cookies } from "next/headers";
import { SESSION_COOKIE, signOut } from "@/server/auth";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await signOut(token);
  const response = Response.json({ ok: true });
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return response;
}

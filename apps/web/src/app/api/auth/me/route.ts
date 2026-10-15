// GET /api/auth/me: the signed-in user.
import { currentUser } from "@/server/auth";

export async function GET() {
  const user = await currentUser();
  return user
    ? Response.json({ user })
    : Response.json({ error: "Sign in first." }, { status: 401 });
}

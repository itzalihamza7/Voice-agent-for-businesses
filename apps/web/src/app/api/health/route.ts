// GET /api/health: for load balancers and uptime checks. 200 when the database answers.
import { getPrisma } from "@/server/store";

export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}

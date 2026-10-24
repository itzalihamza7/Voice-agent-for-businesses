// GET /api/admin/businesses: every business with its usage (platform admins only; the proxy checks).
import { businessesOverview } from "@/server/admin";

export async function GET() {
  return Response.json({ businesses: await businessesOverview() });
}

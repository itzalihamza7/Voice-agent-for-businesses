// PATCH /api/admin/businesses/:id { suspended }: suspend or reactivate a business (platform admins).
import { z } from "zod";
import { setSuspended } from "@/server/admin";
import { parseJsonBody } from "@/server/http";

type Context = { params: Promise<{ businessId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, z.object({ suspended: z.boolean() }));
  if ("response" in parsed) return parsed.response;
  const ok = await setSuspended((await params).businessId, parsed.data.suspended);
  return ok
    ? Response.json({ suspended: parsed.data.suspended })
    : Response.json({ error: "Not found" }, { status: 404 });
}

// POST /api/connections/:id/test { action, args }: runs one action against the app, as an agent
// would, and returns the result (to check the URL, credential and parameters).
import { z } from "zod";
import { currentBusinessId } from "@/server/business";
import { businessConnectionTools, listConnections } from "@/server/connections";
import { parseJsonBody } from "@/server/http";

type Context = { params: Promise<{ connectionId: string }> };
const TestSchema = z.object({
  action: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, TestSchema);
  if ("response" in parsed) return parsed.response;
  const businessId = await currentBusinessId();
  const { connectionId } = await params;
  const connection = (await listConnections(businessId)).find((c) => c.id === connectionId);
  if (!connection) return Response.json({ error: "Not found" }, { status: 404 });
  const tool = (await businessConnectionTools(businessId)).find(
    (t) => t.name === `${connection.slug}_${parsed.data.action}`,
  );
  if (!tool) return Response.json({ error: "No such action." }, { status: 404 });
  const started = performance.now();
  const result = await tool.execute(parsed.data.args, { now: new Date() });
  return Response.json({ result, latencyMs: Math.round(performance.now() - started) });
}

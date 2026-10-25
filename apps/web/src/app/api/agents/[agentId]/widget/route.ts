// GET /api/agents/:agentId/widget: the agent's website widget (or null) and today's usage.
// PUT { enabled, allowedHosts, color, title, dailyCostCapUsd }: create or change it.
import { WidgetSettingsSchema } from "@voice-agent/shared";
import { currentBusinessId } from "@/server/business";
import { parseJsonBody } from "@/server/http";
import { getWidget, saveWidget, usageToday } from "@/server/widget";

type Context = { params: Promise<{ agentId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const businessId = await currentBusinessId();
  const { agentId } = await params;
  const [widget, usage] = await Promise.all([
    getWidget(businessId, agentId),
    usageToday(businessId, agentId),
  ]);
  return Response.json({ widget, usage });
}

export async function PUT(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, WidgetSettingsSchema);
  if ("response" in parsed) return parsed.response;
  const widget = await saveWidget(await currentBusinessId(), (await params).agentId, parsed.data);
  return widget
    ? Response.json({ widget })
    : Response.json({ error: "Not found" }, { status: 404 });
}

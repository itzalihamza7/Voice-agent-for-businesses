// POST /api/inbox/:chatId/finish: the team member hands the chat back to the AI, or marks a
// call-back or WhatsApp hand-off as dealt with.
import { staffMember } from "@/server/inbox";
import { finishHandoff } from "@/server/web-chats";

type Context = { params: Promise<{ chatId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { businessId, staff } = await staffMember();
  const ok = await finishHandoff(businessId, (await params).chatId, staff);
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
}

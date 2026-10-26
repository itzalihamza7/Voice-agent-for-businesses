// POST /api/inbox/:chatId/join: a team member takes the chat; the AI stops answering.
import { staffMember } from "@/server/inbox";
import { joinChat } from "@/server/web-chats";

type Context = { params: Promise<{ chatId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { businessId, staff } = await staffMember();
  const ok = await joinChat(businessId, (await params).chatId, staff);
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
}

// GET /api/inbox/:chatId: one website chat with every message, the summary and the visitor's
// details, for the team member taking over.
import { currentBusinessId } from "@/server/business";
import { inboxChat } from "@/server/web-chats";

type Context = { params: Promise<{ chatId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const chat = await inboxChat(await currentBusinessId(), (await params).chatId);
  return chat ? Response.json({ chat }) : Response.json({ error: "Not found" }, { status: 404 });
}

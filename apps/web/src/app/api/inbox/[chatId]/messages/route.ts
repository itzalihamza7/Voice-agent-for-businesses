// POST /api/inbox/:chatId/messages { text }: a team member replies to the visitor (joining the
// chat if they hadn't).
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { staffMember } from "@/server/inbox";
import { staffReply } from "@/server/web-chats";

type Context = { params: Promise<{ chatId: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(
    request,
    z.object({ text: z.string().trim().min(1).max(2000) }),
  );
  if ("response" in parsed) return parsed.response;
  const { businessId, staff } = await staffMember();
  const ok = await staffReply(businessId, (await params).chatId, staff, parsed.data.text);
  return ok
    ? Response.json({ ok }, { status: 201 })
    : Response.json({ error: "Not found" }, { status: 404 });
}

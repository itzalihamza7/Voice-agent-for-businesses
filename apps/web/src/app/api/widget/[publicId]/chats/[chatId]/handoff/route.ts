// POST /api/widget/:publicId/chats/:chatId/handoff { token, channel, name?, contact? }: the
// visitor asks to reach the team: a person in this chat, WhatsApp, a call, or a call-back. Each
// carries the chat's context (a reference the team looks up; for WhatsApp, the question too).
import { HandoffRequestSchema } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";
import { json, openChat } from "@/server/widget-chat";
import { requestHandoff } from "@/server/web-chats";

type Context = { params: Promise<{ publicId: string; chatId: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, HandoffRequestSchema);
  if ("response" in parsed) return parsed.response;
  const { publicId, chatId } = await params;
  const opened = await openChat(publicId, chatId, parsed.data.token);
  if (opened instanceof Response) return opened;
  const result = await requestHandoff(opened.widget, chatId, parsed.data.channel, {
    ...(parsed.data.name ? { name: parsed.data.name } : {}),
    ...(parsed.data.contact ? { contact: parsed.data.contact } : {}),
  });
  return "error" in result ? json(result, 400) : json(result);
}

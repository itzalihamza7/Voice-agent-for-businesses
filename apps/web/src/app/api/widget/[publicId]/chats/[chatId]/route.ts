// POST /api/widget/:publicId/chats/:chatId { token, text }: the visitor's message. Returns only
// the agent's words and whether the chat has ended.
import { WidgetMessageSchema } from "@voice-agent/shared";
import { getCallSessions } from "@/server/calls";
import { parseJsonBody } from "@/server/http";
import { countUsage } from "@/server/widget";
import {
  chatError,
  json,
  openChat,
  recordWebTurn,
  visible,
  widgetDeps,
} from "@/server/widget-chat";

type Context = { params: Promise<{ publicId: string; chatId: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, WidgetMessageSchema);
  if ("response" in parsed) return parsed.response;
  const { publicId, chatId } = await params;
  const opened = await openChat(publicId, chatId, parsed.data.token);
  if (opened instanceof Response) return opened;

  let close = async () => {};
  try {
    const built = await widgetDeps(opened.widget, opened.version, chatId);
    close = built.close;
    const result = await (
      await getCallSessions()
    ).send(chatId, { type: "reply", text: parsed.data.text }, built.deps);
    await Promise.all([
      recordWebTurn(chatId, result),
      countUsage(opened.widget.agentId, result, false),
    ]);
    return json(visible(result));
  } catch (error) {
    return chatError(error);
  } finally {
    await close();
  }
}

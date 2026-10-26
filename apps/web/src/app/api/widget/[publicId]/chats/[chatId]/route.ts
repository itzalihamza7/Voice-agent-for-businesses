// GET /api/widget/:publicId/chats/:chatId?token=…&after=<time>: the chat as the visitor sees it
// (to reopen it from their history, or to poll for the team's replies during a live chat).
// POST { token, text }: the visitor's message. The AI answers, or, while a person has taken
// over, the team sees it in the Inbox. With "Accept: text/event-stream", the answer is a stream
// of what the agent is doing and the reply's sentences as they come, then the same answer.
import type { ProgressUpdate } from "@voice-agent/orchestrator";
import { WidgetMessageSchema } from "@voice-agent/shared";
import { getCallSessions } from "@/server/calls";
import { parseJsonBody } from "@/server/http";
import { countUsage } from "@/server/widget";
import {
  aiRefusal,
  chatError,
  json,
  openChat,
  recordWebTurn,
  streamTurn,
  visible,
  wantsStream,
  widgetDeps,
} from "@/server/widget-chat";
import { addMessages, webChatMode, webChatView } from "@/server/web-chats";

type Context = { params: Promise<{ publicId: string; chatId: string }> };

export async function GET(request: Request, { params }: Context) {
  const url = new URL(request.url);
  const { publicId, chatId } = await params;
  const opened = await openChat(publicId, chatId, url.searchParams.get("token") ?? "");
  if (opened instanceof Response) return opened;
  const after = url.searchParams.get("after");
  const chat = await webChatView(chatId, {
    ended: opened.ended,
    ...(after && !Number.isNaN(Date.parse(after)) ? { after: new Date(after) } : {}),
  });
  return chat ? json({ chat }) : json({ error: "Unknown chat." }, 404);
}

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, WidgetMessageSchema);
  if ("response" in parsed) return parsed.response;
  const { publicId, chatId } = await params;
  const opened = await openChat(publicId, chatId, parsed.data.token);
  if (opened instanceof Response) return opened;
  const text = parsed.data.text;

  // A person has taken over (or is about to): the message goes to them, not the AI.
  const mode = await webChatMode(chatId);
  if (mode !== "bot") {
    await addMessages(chatId, [{ sender: "visitor", text }]);
    const answer = { replies: [], ended: opened.ended, handoffSuggested: false, mode };
    return wantsStream(request) ? streamTurn(async () => answer) : json(answer);
  }

  const refused = await aiRefusal(opened);
  if (refused) return refused;
  // Saved straight away: the team (and the visitor's other tabs) see it while the AI works.
  await addMessages(chatId, [{ sender: "visitor", text }]);

  const run = async (onProgress?: (update: ProgressUpdate) => void) => {
    const built = await widgetDeps(opened.widget, opened.version, chatId);
    try {
      const result = await (
        await getCallSessions()
      ).send(
        chatId,
        { type: "reply", text },
        onProgress ? { ...built.deps, onProgress } : built.deps,
      );
      const shown = visible(result);
      await addMessages(
        chatId,
        shown.replies.map((reply) => ({ sender: "agent" as const, text: reply })),
      );
      await Promise.all([
        recordWebTurn(chatId, result),
        countUsage(opened.widget.agentId, result, false),
      ]);
      return { ...shown, mode: "bot" };
    } finally {
      await built.close();
    }
  };

  if (wantsStream(request)) return streamTurn(run);
  try {
    return json(await run());
  } catch (error) {
    return chatError(error);
  }
}

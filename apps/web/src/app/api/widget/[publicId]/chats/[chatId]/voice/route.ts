// POST /api/widget/:publicId/chats/:chatId/voice (multipart: "audio", "token"): the visitor
// speaks. Returns what was heard, the agent's words and its reply as audio (base64). While a
// person has taken over, what was heard goes to them instead.
import { createSpeechToText } from "@voice-agent/pipeline";
import { countUsage } from "@/server/widget";
import {
  aiRefusal,
  chatError,
  json,
  openChat,
  recordWebTurn,
  visible,
  widgetDeps,
} from "@/server/widget-chat";
import { voiceTurn } from "@/server/voice";
import { addMessages, webChatMode } from "@/server/web-chats";

type Context = { params: Promise<{ publicId: string; chatId: string }> };

const MAX_AUDIO_BYTES = 2_000_000;

export async function POST(request: Request, { params }: Context) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const token = String(form?.get("token") ?? "");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return json({ error: "Send one short recording." }, 400);
  }
  const { publicId, chatId } = await params;
  const opened = await openChat(publicId, chatId, token);
  if (opened instanceof Response) return opened;
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const type = audio.type || "audio/webm";

  try {
    const mode = await webChatMode(chatId);
    if (mode !== "bot") {
      const heard = (await createSpeechToText().transcribe(bytes, type)).text;
      if (heard) await addMessages(chatId, [{ sender: "visitor", text: heard }]);
      return json({
        heard,
        replies: [],
        ended: opened.ended,
        handoffSuggested: false,
        mode,
        audio: null,
      });
    }

    const refused = await aiRefusal(opened);
    if (refused) return refused;
    const built = await widgetDeps(opened.widget, opened.version, chatId);
    try {
      const turn = await voiceTurn(chatId, bytes, type, built.deps, "mp3", recordWebTurn);
      const shown = turn.result
        ? visible(turn.result)
        : { replies: [], ended: false, handoffSuggested: false };
      if (turn.heard) {
        await addMessages(chatId, [
          { sender: "visitor", text: turn.heard },
          ...shown.replies.map((text) => ({ sender: "agent" as const, text })),
        ]);
      }
      if (turn.result) await countUsage(opened.widget.agentId, turn.result, false);
      return json({
        heard: turn.heard,
        ...shown,
        mode: "bot",
        audio: turn.audio ? Buffer.from(turn.audio).toString("base64") : null,
        mimeType: turn.mimeType,
      });
    } finally {
      await built.close();
    }
  } catch (error) {
    return chatError(error);
  }
}

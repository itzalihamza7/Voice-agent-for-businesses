// POST /api/widget/:publicId/chats/:chatId/voice (multipart: "audio", "token"): the visitor
// speaks. Returns what was heard, the agent's words and its reply as audio (base64).
import { countUsage } from "@/server/widget";
import {
  chatError,
  json,
  openChat,
  recordWebTurn,
  visible,
  widgetDeps,
} from "@/server/widget-chat";
import { voiceTurn } from "@/server/voice";

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

  let close = async () => {};
  try {
    const built = await widgetDeps(opened.widget, opened.version, chatId);
    close = built.close;
    const turn = await voiceTurn(
      chatId,
      new Uint8Array(await audio.arrayBuffer()),
      audio.type || "audio/webm",
      built.deps,
      "mp3",
      recordWebTurn,
    );
    if (turn.result) await countUsage(opened.widget.agentId, turn.result, false);
    return json({
      heard: turn.heard,
      ...(turn.result ? visible(turn.result) : { replies: [], ended: false }),
      audio: turn.audio ? Buffer.from(turn.audio).toString("base64") : null,
      mimeType: turn.mimeType,
    });
  } catch (error) {
    return chatError(error);
  } finally {
    await close();
  }
}

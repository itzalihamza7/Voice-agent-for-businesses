// POST /api/test-calls/:callId/voice (multipart: "audio" = one recorded utterance, "settings" =
// JSON with models, prompt, tools, contextBudget): one voice turn. Speech-to-text, the call's
// next turn (LangGraph), then text-to-speech of everything the agent says. Returns what was
// heard, the turn's result, the reply as base64 MP3, and how long each step took.
import { ConversationError } from "@voice-agent/orchestrator";
import { ProviderConfigError } from "@voice-agent/pipeline";
import { TestCallActionSchema } from "@voice-agent/shared";
import { currentBusinessId } from "@/server/business";
import { conversationDeps } from "@/server/conversation";
import { voiceTurn } from "@/server/voice";

type Context = { params: Promise<{ callId: string }> };

const SettingsSchema = TestCallActionSchema.omit({ action: true });
const MAX_AUDIO_BYTES = 5_000_000;

export async function POST(request: Request, { params }: Context) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const settings = SettingsSchema.safeParse(JSON.parse(String(form?.get("settings") ?? "null")));
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Send one recording (up to 5 MB) as 'audio'." }, { status: 400 });
  }
  if (!settings.success) return Response.json({ error: "Invalid settings." }, { status: 400 });

  let close = async () => {};
  try {
    const built = await conversationDeps(
      settings.data,
      await currentBusinessId(),
      (await params).callId,
    );
    close = built.close;
    const turn = await voiceTurn(
      (await params).callId,
      new Uint8Array(await audio.arrayBuffer()),
      audio.type || "audio/webm",
      built.deps,
    );
    return Response.json({
      ...turn,
      audio: turn.audio ? Buffer.from(turn.audio).toString("base64") : null,
    });
  } catch (error) {
    if (error instanceof ConversationError || error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  } finally {
    await close();
  }
}

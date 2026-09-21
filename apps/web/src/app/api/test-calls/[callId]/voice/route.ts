// POST /api/test-calls/:callId/voice (multipart: "audio" = one recorded utterance, "settings" =
// JSON with models, prompt, tools, contextBudget): one voice turn. Speech-to-text, the call's
// next turn (LangGraph), then text-to-speech of everything the agent says. Returns what was
// heard, the turn's result, the reply as base64 MP3, and how long each step took.
import { ConversationError } from "@voice-agent/orchestrator";
import { createSpeechToText, createTextToSpeech, ProviderConfigError } from "@voice-agent/pipeline";
import { spokenLines, TestCallActionSchema } from "@voice-agent/shared";
import { getCallSessions } from "@/server/calls";
import { conversationDeps } from "@/server/conversation";

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

  const started = performance.now();
  let close = async () => {};
  try {
    const heard = await createSpeechToText().transcribe(
      new Uint8Array(await audio.arrayBuffer()),
      audio.type || "audio/webm",
    );
    const sttMs = Math.round(performance.now() - started);
    if (!heard.text) return Response.json({ heard: "", timings: { sttMs } });

    const agentStarted = performance.now();
    const built = await conversationDeps(settings.data);
    close = built.close;
    const result = await (
      await getCallSessions()
    ).send((await params).callId, { type: "reply", text: heard.text }, built.deps);
    const agentMs = Math.round(performance.now() - agentStarted);

    const lines = spokenLines(result.events);
    const ttsStarted = performance.now();
    const speech = lines.length ? await createTextToSpeech().synthesize(lines.join(" ")) : null;
    const ttsMs = Math.round(performance.now() - ttsStarted);
    return Response.json({
      heard: heard.text,
      result,
      audio: speech ? Buffer.from(speech.audio).toString("base64") : null,
      mimeType: speech?.mimeType ?? null,
      timings: { sttMs, agentMs, ttsMs, totalMs: Math.round(performance.now() - started) },
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

// POST /api/phone/calls/:callId/turn?to=<number> (voice gateway only; body = one utterance as
// WAV): one phone voice turn. Returns what was heard, the turn's result (the gateway transfers or
// hangs up from its events) and the reply as raw 24 kHz PCM.
import { conversationDeps } from "@/server/conversation";
import { agentForNumber, fromGateway, phoneModel } from "@/server/phone";
import { voiceTurn } from "@/server/voice";

type Context = { params: Promise<{ callId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!fromGateway(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const to = new URL(request.url).searchParams.get("to") ?? "";
  const agent = await agentForNumber(to);
  if (!agent) return Response.json({ error: `No agent answers ${to}.` }, { status: 404 });
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length === 0) return Response.json({ error: "No audio." }, { status: 400 });

  const model = phoneModel();
  const built = await conversationDeps({
    models: { decisions: model, replies: model, fallback: null },
    prompt: agent.config.prompt,
    tools: agent.config.tools,
  });
  try {
    const turn = await voiceTurn((await params).callId, audio, "audio/wav", built.deps, "pcm");
    return Response.json({
      ...turn,
      audio: turn.audio ? Buffer.from(turn.audio).toString("base64") : null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  } finally {
    await built.close();
  }
}

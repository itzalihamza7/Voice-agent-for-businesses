// POST /api/phone/calls { to, from } (voice gateway only): a phone call has started. Finds the
// agent for the dialled number, starts the call (LangGraph thread, caller memory by the caller's
// number) and returns its id and the greeting as raw 24 kHz PCM for the phone line.
import { z } from "zod";
import { getCallSessions } from "@/server/calls";
import { conversationDeps } from "@/server/conversation";
import { parseJsonBody } from "@/server/http";
import { agentForNumber, fromGateway, phoneModel } from "@/server/phone";
import { speakEvents } from "@/server/voice";

const StartPhoneCallSchema = z.object({ to: z.string().min(3), from: z.string().min(3) });

export async function POST(request: Request) {
  if (!fromGateway(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(request, StartPhoneCallSchema);
  if ("response" in parsed) return parsed.response;
  const { to, from } = parsed.data;
  const agent = await agentForNumber(to);
  if (!agent) return Response.json({ error: `No agent answers ${to}.` }, { status: 404 });

  const model = phoneModel();
  const built = await conversationDeps({
    models: { decisions: model, replies: model, fallback: null },
    prompt: agent.config.prompt,
    tools: agent.config.tools,
  });
  try {
    const callId = crypto.randomUUID();
    const caller = /^\+?[0-9 ()-]{6,20}$/.test(from) ? from : undefined;
    const result = await (
      await getCallSessions()
    ).start(callId, agent.config.flow, built.deps, {
      source: "phone",
      agentId: agent.config.agentId,
      agentVersion: agent.config.version,
      ...(caller ? { callerPhone: caller } : {}),
    });
    const speech = await speakEvents(result, "pcm");
    return Response.json({
      callId,
      agentId: agent.config.agentId,
      version: agent.config.version,
      result,
      audio: speech ? Buffer.from(speech.audio).toString("base64") : null,
    });
  } finally {
    await built.close();
  }
}

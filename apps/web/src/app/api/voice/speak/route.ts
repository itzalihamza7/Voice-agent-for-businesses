// POST /api/voice/speak { text }: the text as speech (MP3), with the configured TTS provider.
import { createTextToSpeech, ProviderConfigError } from "@voice-agent/pipeline";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";

const SpeakSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SpeakSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const speech = await createTextToSpeech().synthesize(parsed.data.text);
    return new Response(speech.audio as BodyInit, {
      headers: {
        "content-type": speech.mimeType,
        "x-latency-ms": String(speech.latencyMs ?? 0),
      },
    });
  } catch (error) {
    const status = error instanceof ProviderConfigError ? 400 : 502;
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status },
    );
  }
}

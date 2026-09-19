import { describe, expect, it, vi } from "vitest";
import { OpenAISpeechToText } from "./stt/openai";
import { OpenAITextToSpeech } from "./tts/openai";

describe("OpenAI speech providers", () => {
  it("uploads a recording with a file name OpenAI recognises and returns the text", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ text: " How much is a haircut? " }));
    const stt = new OpenAISpeechToText({
      apiKey: "k",
      model: "gpt-4o-mini-transcribe",
      fetch: fetchMock,
    });
    const result = await stt.transcribe(new Uint8Array([1, 2, 3]), "audio/mpeg");
    expect(result.text).toBe("How much is a haircut?");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const form = init?.body as FormData;
    expect((form.get("file") as File).name).toBe("speech.mp3");
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
  });

  it("synthesizes MP3 and reports errors with the status", async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([9, 9])));
    const tts = new OpenAITextToSpeech({
      apiKey: "k",
      model: "gpt-4o-mini-tts",
      voice: "coral",
      fetch: ok,
    });
    const speech = await tts.synthesize("Hello");
    expect(speech).toMatchObject({ audio: new Uint8Array([9, 9]), mimeType: "audio/mpeg" });
    expect(JSON.parse(String(ok.mock.calls[0]![1]?.body))).toMatchObject({
      voice: "coral",
      input: "Hello",
    });

    const failing = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(
      new OpenAITextToSpeech({ apiKey: "k", model: "m", voice: "v", fetch: failing }).synthesize(
        "Hi",
      ),
    ).rejects.toThrow("HTTP 401");
  });
});

import { writeFileSync } from "node:fs";
import WebSocket from "ws";
import { bytesToPcm, downsample24kTo8k, frames, muLawToPcm, pcmToMuLaw, wav } from "../src/audio";

// A simulated phone call: plays Twilio's part against the gateway, so phone calls can be tested
// without a Twilio number. The caller's lines are spoken with the web app's text-to-speech and
// sent as μ-law frames; the agent's audio is collected and saved as WAV to listen to.
//
//   npm run fake-call -w @voice-agent/voice-gateway -- +441632960000 "How much is balayage?" ...

const [to = "+441632960000", ...lines] = process.argv.slice(2);
const caller = lines.length
  ? lines
  : ["Hi, how much is a men's haircut?", "Can I speak to a real person, please?"];
const gateway = process.env.GATEWAY_WS ?? "ws://localhost:8080/twilio/stream";
const web = process.env.WEB_URL ?? "http://localhost:3000";

// The caller's voice comes from the web app's text-to-speech, which needs a signed-in user.
let cookie = "";
async function signIn() {
  const response = await fetch(`${web}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.DEMO_EMAIL ?? "demo@example.com",
      password: process.env.DEMO_PASSWORD ?? "demo-password",
    }),
  });
  if (!response.ok) throw new Error(`sign-in: HTTP ${response.status}`);
  cookie = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}

async function speech(text: string): Promise<Uint8Array> {
  if (!cookie) await signIn();
  const response = await fetch(`${web}/api/voice/speak`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ text, format: "pcm" }),
  });
  if (!response.ok) throw new Error(`speak: HTTP ${response.status}`);
  return pcmToMuLaw(downsample24kTo8k(bytesToPcm(new Uint8Array(await response.arrayBuffer()))));
}

const socket = new WebSocket(gateway);
const agentAudio: Int16Array[] = [];
let waiting: (() => void) | null = null;
const send = (message: object) => socket.send(JSON.stringify(message));

socket.on("message", (data) => {
  const message = JSON.parse(String(data)) as {
    event: string;
    media?: { payload: string };
    mark?: { name: string };
  };
  if (message.event === "media")
    agentAudio.push(muLawToPcm(Buffer.from(message.media!.payload, "base64")));
  if (message.event === "mark") {
    // Like Twilio: confirm the mark once the audio before it has "played".
    send({ event: "mark", streamSid: "MZfake", mark: message.mark });
    if (message.mark!.name === "agent-done") waiting?.();
  }
});

const agentDone = () => new Promise<void>((resolve) => (waiting = resolve));

socket.on("open", async () => {
  send({ event: "connected" });
  const greeting = agentDone();
  send({
    event: "start",
    start: {
      streamSid: "MZfake",
      callSid: "SIMfake",
      customParameters: { to, from: "+447700900123" },
    },
  });
  await greeting;
  console.log(`greeting: ${seconds(agentAudio)} s of audio`);
  for (const line of caller) {
    const before = agentAudio.length;
    const reply = agentDone();
    const silence = new Uint8Array(160 * 40).fill(0xff); // 0.8 s of μ-law silence
    for (const frame of [...frames(await speech(line)), ...frames(silence)]) {
      send({ event: "media", media: { payload: Buffer.from(frame).toString("base64") } });
    }
    console.log(`caller said: "${line}"`);
    await Promise.race([reply, new Promise((r) => setTimeout(r, 60_000))]);
    console.log(`  agent replied with ${seconds(agentAudio.slice(before))} s of audio`);
  }
  const all = new Int16Array(agentAudio.reduce((n, f) => n + f.length, 0));
  let offset = 0;
  for (const f of agentAudio) {
    all.set(f, offset);
    offset += f.length;
  }
  writeFileSync("agent-audio.wav", wav(all, 8000));
  console.log("saved the agent's side as agent-audio.wav");
  send({ event: "stop" });
  socket.close();
});

function seconds(chunks: Int16Array[]): string {
  return (chunks.reduce((n, f) => n + f.length, 0) / 8000).toFixed(1);
}

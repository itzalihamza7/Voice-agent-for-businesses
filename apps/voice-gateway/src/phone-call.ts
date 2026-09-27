import type { WebSocket } from "ws";
import { bytesToPcm, downsample24kTo8k, frames, muLawToPcm, pcmToMuLaw, wav } from "./audio";
import { transferCall } from "./twilio-rest";
import { PHONE_UTTERANCES, UtteranceDetector } from "./utterances";
import type { PhoneTurn, WebClient } from "./web-client";

// One phone call on a Twilio media stream:
//   - "start": find the agent for the dialled number, play its greeting;
//   - "media": the caller's audio, cut into utterances; each one becomes a turn in the web app;
//   - speaking over the agent clears Twilio's audio queue (barge-in);
//   - Transfer and End steps move the call to a person or hang up.
// Twilio message format: https://www.twilio.com/docs/voice/media-streams/websocket-messages

type TwilioMessage =
  | { event: "connected" }
  | {
      event: "start";
      start: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
    }
  | { event: "media"; media: { payload: string } }
  | { event: "mark"; mark: { name: string } }
  | { event: "stop" };

export class PhoneCall {
  private streamSid = "";
  private callSid = "";
  private to = "";
  private callId: string | null = null;
  /** Audio is queued in Twilio until this mark comes back. */
  private agentSpeaking = false;
  private busy = false;
  /** Speech that arrived while a turn was running; handled as the next utterance. */
  private held: Int16Array[] = [];
  private ended = false;
  private readonly detector: UtteranceDetector;

  constructor(
    private readonly socket: WebSocket,
    private readonly web: WebClient,
    private readonly log: (message: string) => void = console.log,
  ) {
    this.detector = new UtteranceDetector(
      PHONE_UTTERANCES,
      (pcm) => void this.onUtterance(pcm),
      () => this.bargeIn(),
    );
    socket.on("message", (data) => void this.onMessage(JSON.parse(String(data)) as TwilioMessage));
  }

  private async onMessage(message: TwilioMessage) {
    switch (message.event) {
      case "start": {
        this.streamSid = message.start.streamSid;
        this.callSid = message.start.callSid;
        const params = message.start.customParameters ?? {};
        this.to = params.to ?? "";
        this.log(`call ${this.callSid}: ${params.from ?? "?"} → ${this.to}`);
        try {
          const started = await this.web.startCall(this.to, params.from ?? "unknown");
          this.callId = started.callId;
          await this.handle(started);
        } catch (error) {
          this.log(`could not start: ${String(error)}`);
          this.socket.close();
        }
        return;
      }
      case "media":
        if (!this.ended)
          this.detector.push(muLawToPcm(Buffer.from(message.media.payload, "base64")));
        return;
      case "mark":
        if (message.mark.name === "agent-done") this.agentSpeaking = false;
        if (message.mark.name === "hang-up") this.socket.close();
        return;
      case "stop":
        this.log(`call ${this.callSid} ended`);
        return;
    }
  }

  /** The caller started talking: if the agent is speaking, stop it. */
  private bargeIn() {
    if (!this.agentSpeaking) return;
    this.send({ event: "clear", streamSid: this.streamSid });
    this.agentSpeaking = false;
    this.log("barge-in: cleared the agent's audio");
  }

  private async onUtterance(pcm8k: Int16Array) {
    if (!this.callId || this.ended) return;
    // Callers pause mid-sentence; what they say while the last turn runs isn't thrown away.
    if (this.busy) {
      this.held.push(pcm8k);
      return;
    }
    this.busy = true;
    try {
      const turn = await this.web.turn(this.callId, this.to, wav(pcm8k, 8000));
      if (turn.heard) this.log(`caller: ${turn.heard}`);
      await this.handle(turn);
    } catch (error) {
      this.log(`turn failed: ${String(error)}`);
    } finally {
      this.busy = false;
    }
    if (this.held.length && !this.ended) {
      const held = this.held;
      this.held = [];
      const joined = new Int16Array(held.reduce((n, p) => n + p.length, 0));
      let offset = 0;
      for (const part of held) {
        joined.set(part, offset);
        offset += part.length;
      }
      await this.onUtterance(joined);
    }
  }

  /** Plays the agent's reply, then transfers or hangs up if the flow says so. */
  private async handle(turn: PhoneTurn) {
    for (const event of turn.result?.events ?? []) {
      if (event.type === "aiResponse" || event.type === "say" || event.type === "ask") {
        this.log(
          `agent: ${(event as { text?: string; question?: string }).text ?? (event as { question?: string }).question}`,
        );
      }
    }
    if (turn.audio) this.play(Buffer.from(turn.audio, "base64"));
    const transfer = turn.result?.events.find((e) => e.type === "transfer");
    if (transfer?.phoneNumber) {
      this.ended = true;
      this.log(await transferCall(this.callSid, transfer.phoneNumber));
      return;
    }
    if (turn.result?.state.nodeId === null) {
      this.ended = true;
      // Hang up once the goodbye has played.
      this.send({ event: "mark", streamSid: this.streamSid, mark: { name: "hang-up" } });
    }
  }

  private play(pcm24kBytes: Uint8Array) {
    const mulaw = pcmToMuLaw(downsample24kTo8k(bytesToPcm(pcm24kBytes)));
    for (const frame of frames(mulaw)) {
      this.send({
        event: "media",
        streamSid: this.streamSid,
        media: { payload: Buffer.from(frame).toString("base64") },
      });
    }
    this.agentSpeaking = true;
    this.send({ event: "mark", streamSid: this.streamSid, mark: { name: "agent-done" } });
  }

  private send(message: object) {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

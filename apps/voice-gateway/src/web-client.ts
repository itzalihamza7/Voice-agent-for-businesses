// The web app runs the agents; the gateway only handles the phone line. These calls go to the
// web app's phone API with the shared secret.

export interface TurnEvents {
  events: { type: string; phoneNumber?: string; message?: string }[];
  state: { nodeId: string | null };
}

export interface PhoneTurn {
  heard?: string;
  result: TurnEvents | null;
  /** Raw 16-bit PCM at 24 kHz, base64. */
  audio: string | null;
}

export class WebClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async startCall(to: string, from: string): Promise<PhoneTurn & { callId: string }> {
    return this.post("/api/phone/calls", JSON.stringify({ to, from }), "application/json");
  }

  async turn(callId: string, to: string, wav: Uint8Array): Promise<PhoneTurn> {
    return this.post(
      `/api/phone/calls/${callId}/turn?to=${encodeURIComponent(to)}`,
      Buffer.from(wav),
      "audio/wav",
    );
  }

  private async post<T>(path: string, body: string | Buffer, type: string): Promise<T> {
    const response = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: { "content-type": type, "x-gateway-secret": this.secret },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
    return json;
  }
}

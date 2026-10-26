// Alerts to a business's team on WhatsApp (a visitor wants a person, asked to be called back, …).
// The platform sends them from its own WhatsApp sender, through Twilio or Meta's Cloud API:
//   Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM ("whatsapp:+14155238886")
//   Meta:   WHATSAPP_CLOUD_TOKEN, WHATSAPP_PHONE_NUMBER_ID
// Without either, alerts are only logged: the Inbox (with its badge and browser notifications)
// still shows every hand-off. Note: WhatsApp only delivers free-form messages to a number that
// wrote to the sender in the last 24 hours; outside that, an approved template is needed.

export interface WhatsAppSender {
  via: "twilio" | "meta";
  send(to: string, text: string): Promise<void>;
}

type Env = Record<string, string | undefined>;

export function whatsappSender(
  env: Env = process.env,
  http: typeof fetch = fetch,
): WhatsAppSender | null {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM) {
    const sid = env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const from = env.TWILIO_WHATSAPP_FROM;
    return {
      via: "twilio",
      async send(to, text) {
        const response = await http(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              authorization: `Basic ${auth}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ From: from, To: `whatsapp:${to}`, Body: text }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!response.ok) throw new Error(`Twilio answered HTTP ${response.status}`);
      },
    };
  }
  if (env.WHATSAPP_CLOUD_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    const token = env.WHATSAPP_CLOUD_TOKEN;
    const numberId = env.WHATSAPP_PHONE_NUMBER_ID;
    return {
      via: "meta",
      async send(to, text) {
        const response = await http(`https://graph.facebook.com/v21.0/${numberId}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to.replace(/^\+/, ""),
            type: "text",
            text: { body: text },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`WhatsApp Cloud API answered HTTP ${response.status}`);
      },
    };
  }
  return null;
}

/** Sends a team alert. Never throws: a failed alert must not fail the visitor's request. */
export async function alertTeam(
  to: string | null,
  text: string,
  sender: WhatsAppSender | null = whatsappSender(),
): Promise<{ sent: boolean; via: string; error?: string }> {
  if (!to) return { sent: false, via: "inbox" };
  if (!sender) {
    console.info(
      `[alert] WhatsApp isn't configured; alert for ${to.slice(0, 4)}… stays in the Inbox.`,
    );
    return { sent: false, via: "log" };
  }
  try {
    await sender.send(to, text);
    return { sent: true, via: sender.via };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[alert] WhatsApp alert failed: ${message}`);
    return { sent: false, via: sender.via, error: message };
  }
}

/** A wa.me link that opens WhatsApp with a message ready to send. */
export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

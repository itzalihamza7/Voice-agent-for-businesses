import { describe, expect, it, vi } from "vitest";
import { alertTeam, whatsappLink, whatsappSender } from "./notify";

describe("team alerts on WhatsApp", () => {
  it("sends through Twilio when it's configured", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 201 }));
    const sender = whatsappSender(
      { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_WHATSAPP_FROM: "whatsapp:+1415" },
      http,
    );
    expect(await alertTeam("+34600111222", "A visitor wants a person", sender)).toEqual({
      sent: true,
      via: "twilio",
    });
    const [url, init] = http.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(String(init?.body)).toContain("To=whatsapp%3A%2B34600111222");
  });

  it("sends through Meta's Cloud API, without the plus", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const sender = whatsappSender(
      { WHATSAPP_CLOUD_TOKEN: "x", WHATSAPP_PHONE_NUMBER_ID: "99" },
      http,
    );
    await alertTeam("+34600111222", "hi", sender);
    expect(JSON.parse(String(http.mock.calls[0]![1]?.body))).toMatchObject({ to: "34600111222" });
  });

  it("never throws, and says when nothing could be sent", async () => {
    expect(await alertTeam("+34600111222", "hi", null)).toEqual({ sent: false, via: "log" });
    expect(await alertTeam(null, "hi", null)).toEqual({ sent: false, via: "inbox" });
    const failing = { via: "twilio" as const, send: () => Promise.reject(new Error("down")) };
    expect(await alertTeam("+34600111222", "hi", failing)).toMatchObject({
      sent: false,
      error: "down",
    });
  });

  it("builds a WhatsApp link with the message ready", () => {
    expect(whatsappLink("+34 600 111 222", "Hi (ref VS-7K2Q)")).toBe(
      "https://wa.me/34600111222?text=Hi%20(ref%20VS-7K2Q)",
    );
  });
});

import { DEFAULT_AGENT_TOOLS } from "@voice-agent/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkArguments, missingArguments } from "./arguments";
import { BOOKING_TOOLS, resetMockBookings } from "./builtin/booking";
import { assertPublicUrl, isPrivateAddress } from "./network";
import { resolveTools } from "./registry";
import { webhookTool } from "./webhook";

// Sunday, October 18, 2026, 10:00
const now = new Date(2026, 9, 18, 10, 0);
const tool = (name: string) => BOOKING_TOOLS.find((t) => t.name === name)!;

describe("checkArguments", () => {
  const schema = {
    type: "object",
    required: ["date", "people"],
    properties: {
      date: { type: "string" },
      people: { type: "integer" },
      action: { type: "string", enum: ["cancel", "reschedule"] },
      vip: { type: "boolean" },
    },
  };

  it("turns template strings into the schema's types and drops unknown arguments", () => {
    expect(
      checkArguments(schema, { date: "2026-10-23", people: "3", vip: "true", extra: "x" }),
    ).toEqual({
      ok: true,
      args: { date: "2026-10-23", people: 3, vip: true },
    });
  });

  it("reports missing, wrongly typed and not-allowed values", () => {
    expect(missingArguments(schema, { date: "", people: 2 })).toEqual(["date"]);
    expect(checkArguments(schema, { date: "x", people: "two" })).toEqual({
      ok: false,
      error: 'Argument "people" must be integer',
    });
    expect(checkArguments(schema, { date: "x", people: 1, action: "delete" })).toMatchObject({
      ok: false,
    });
  });
});

describe("built-in booking tools", () => {
  beforeEach(() => resetMockBookings());

  it("lists free times, says if a requested time is free, and is closed on Sundays", async () => {
    const friday = await tool("checkAvailability").execute(
      { date: "2026-10-23", time: "15:00" },
      { now },
    );
    expect(friday).toEqual({
      ok: true,
      data: {
        date: "2026-10-23",
        open: true,
        freeTimes: ["09:00", "11:00", "12:00", "14:00", "15:00"],
        requestedTime: "15:00",
        requestedTimeFree: true,
      },
    });
    const sunday = await tool("checkAvailability").execute({ date: "2026-10-25" }, { now });
    expect(sunday).toMatchObject({ ok: true, data: { open: false, freeTimes: [] } });
    expect(await tool("checkAvailability").execute({ date: "2026-10-01" }, { now })).toMatchObject({
      ok: false,
    });
  });

  it("books a free time, then that time is taken and the booking can be found, moved and cancelled", async () => {
    const booked = await tool("createBooking").execute(
      { name: "Ali", service: "Haircut", date: "2026-10-23", time: "15:00", phone: "0300" },
      { now },
    );
    expect(booked).toMatchObject({
      ok: true,
      data: { name: "Ali", date: "2026-10-23", time: "15:00" },
    });
    if (!booked.ok) throw new Error(booked.error);
    const reference = String(booked.data.reference);
    expect(reference).toMatch(/^BK-[A-Z2-9]{4}$/);

    const again = await tool("checkAvailability").execute(
      { date: "2026-10-23", time: "15:00" },
      { now },
    );
    expect(again).toMatchObject({ data: { requestedTimeFree: false } });
    expect(
      await tool("findBooking").execute({ reference: reference.toLowerCase() }, { now }),
    ).toMatchObject({
      data: { found: true, reference },
    });
    expect(
      await tool("updateBooking").execute(
        { reference, action: "reschedule", date: "2026-10-23", time: "11:00" },
        { now },
      ),
    ).toMatchObject({ ok: true, data: { status: "rescheduled", time: "11:00" } });
    expect(
      await tool("updateBooking").execute({ reference, action: "cancel" }, { now }),
    ).toMatchObject({
      data: { status: "cancelled" },
    });
    expect(await tool("findBooking").execute({ reference }, { now })).toMatchObject({
      data: { found: false },
    });
  });

  it("refuses taken or closed times, and always has the demo booking ABC123", async () => {
    expect(
      await tool("createBooking").execute(
        { name: "A", service: "B", date: "2026-10-23", time: "10:00", phone: "1" }, // (23 + 10) % 3 = 0: taken
        { now },
      ),
    ).toMatchObject({ ok: false });
    expect(await tool("findBooking").execute({ reference: "ABC123" }, { now })).toMatchObject({
      data: { found: true, name: "Sam Taylor", date: "2026-10-20" },
    });
  });
});

describe("SSRF guard", () => {
  it("knows private addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.5",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("blocks URLs that point at private networks unless allowed", async () => {
    const lookup = async (host: string) =>
      host === "internal.example" ? ["10.0.0.7"] : ["93.184.216.34"];
    await expect(
      assertPublicUrl("http://internal.example/hook", { allowPrivateHosts: false, lookup }),
    ).rejects.toThrow("private address");
    await expect(
      assertPublicUrl("http://localhost:3000/", { allowPrivateHosts: false, lookup }),
    ).rejects.toThrow();
    await expect(
      assertPublicUrl("http://169.254.169.254/", { allowPrivateHosts: false, lookup }),
    ).rejects.toThrow();
    await expect(
      assertPublicUrl("ftp://example.com/", { allowPrivateHosts: true, lookup }),
    ).rejects.toThrow("http");
    await expect(
      assertPublicUrl("https://api.example.com/", { allowPrivateHosts: false, lookup }),
    ).resolves.toBeUndefined();
    await expect(
      assertPublicUrl("http://localhost:3000/", { allowPrivateHosts: true, lookup }),
    ).resolves.toBeUndefined();
  });
});

describe("webhook tools", () => {
  const config = {
    name: "lookupOrder",
    description: "Find an order",
    url: "https://shop.example.com/hooks/order",
    parameters: { type: "object", properties: { orderId: { type: "string" } } },
  };
  const lookup = async () => ["93.184.216.34"];

  it("POSTs the arguments and returns the JSON object it gets back", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "shipped" }));
    const result = await webhookTool(config, {
      allowPrivateHosts: false,
      fetch: fetchMock,
      lookup,
    }).execute({ orderId: "A1" }, { now });
    expect(result).toEqual({ ok: true, data: { status: "shipped" } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(config.url);
    expect(JSON.parse(String(init?.body))).toEqual({ arguments: { orderId: "A1" } });
    expect(init?.redirect).toBe("manual");
  });

  it("reports errors, redirects and non-object answers instead of throwing", async () => {
    const answers = [
      new Response("nope", { status: 500 }),
      new Response(null, { status: 302 }),
      Response.json([1, 2]),
    ];
    for (const answer of answers) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(answer);
      const result = await webhookTool(config, {
        allowPrivateHosts: false,
        fetch: fetchMock,
        lookup,
      }).execute({}, { now });
      expect(result.ok).toBe(false);
    }
  });
});

describe("resolveTools", () => {
  it("always includes the built-in tools and reports name clashes", async () => {
    const clash = {
      name: "findBooking",
      description: "",
      url: "https://x.example.com",
      parameters: { type: "object" },
    };
    const resolved = await resolveTools(
      { ...DEFAULT_AGENT_TOOLS, webhooks: [clash] },
      { allowPrivateHosts: false },
    );
    expect([...resolved.tools.keys()]).toEqual([
      "checkAvailability",
      "createBooking",
      "findBooking",
      "updateBooking",
    ]);
    expect(resolved.problems[0]).toContain('Two tools are called "findBooking"');
    await resolved.close();
  });

  it("reports an MCP server that can't be reached instead of failing", async () => {
    const resolved = await resolveTools(
      { webhooks: [], mcpServers: [{ name: "down", url: "http://127.0.0.1:9/mcp" }] },
      { allowPrivateHosts: false },
    );
    expect(resolved.problems[0]).toContain('MCP server "down" isn\'t available');
    await resolved.close();
  });
});

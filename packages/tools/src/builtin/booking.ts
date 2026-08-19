import type { Tool, ToolContext, ToolResult } from "../types";

// Built-in booking tools backed by a mock booking system, so booking agents work end to end
// without a real calendar. A real business would replace these with webhook or MCP tools.
//
// The mock schedule: open Monday to Saturday, appointments on the hour from 09:00 to 16:00,
// closed on Sundays. Some slots are taken in a fixed pattern (so results are repeatable), plus
// any slots booked through createBooking. Bookings live in memory and reset on restart.
// One booking always exists, for testing: reference ABC123.

interface Booking {
  reference: string;
  name: string;
  service: string;
  date: string;
  time: string;
  phone: string;
}

const OPENING_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const bookings = new Map<string, Booking>();

function ensureDemoBooking(now: Date) {
  if (bookings.has("ABC123")) return;
  const tuesday = addDays(startOfDay(now), (2 - now.getDay() + 7) % 7 || 7);
  bookings.set("ABC123", {
    reference: "ABC123",
    name: "Sam Taylor",
    service: "Haircut",
    date: isoDate(tuesday),
    time: "10:00",
    phone: "+441234567890",
  });
}

function freeTimes(
  date: string,
  now: Date,
  ignoreReference?: string,
): string[] | "closed" | "past" {
  const day = parseIsoDate(date);
  if (!day) return "past";
  if (day < startOfDay(now)) return "past";
  if (day.getDay() === 0) return "closed";
  const taken = new Set(
    [...bookings.values()]
      .filter((b) => b.date === date && b.reference !== ignoreReference)
      .map((b) => b.time),
  );
  return OPENING_HOURS.filter((hour) => (day.getDate() + hour) % 3 !== 0)
    .map((hour) => `${String(hour).padStart(2, "0")}:00`)
    .filter((time) => !taken.has(time))
    .filter((time) => isoDate(day) !== isoDate(now) || Number(time.slice(0, 2)) > now.getHours());
}

const checkAvailability: Tool = {
  name: "checkAvailability",
  description:
    "Find free appointment times on a date. Also says whether a requested time is free. Dates are YYYY-MM-DD, times HH:MM (24-hour).",
  source: "builtin",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["date"],
    properties: {
      date: { type: "string", description: "YYYY-MM-DD" },
      time: { type: "string", description: "HH:MM, optional: the time the caller asked for" },
    },
  },
  resultFields: ["date", "open", "freeTimes", "requestedTime", "requestedTimeFree"],
  async execute(args, { now }: ToolContext): Promise<ToolResult> {
    ensureDemoBooking(now);
    const date = String(args.date);
    const free = freeTimes(date, now);
    if (free === "past") return { ok: false, error: `${date} is not a valid date in the future.` };
    const requestedTime = args.time ? normaliseTime(String(args.time)) : undefined;
    return {
      ok: true,
      data: {
        date,
        open: free !== "closed",
        freeTimes: free === "closed" ? [] : free,
        ...(requestedTime
          ? {
              requestedTime,
              requestedTimeFree: free !== "closed" && free.includes(requestedTime),
            }
          : {}),
      },
    };
  },
};

const createBooking: Tool = {
  name: "createBooking",
  description: "Book an appointment at a free time. Returns the booking reference.",
  source: "builtin",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["name", "service", "date", "time", "phone"],
    properties: {
      name: { type: "string" },
      service: { type: "string" },
      date: { type: "string", description: "YYYY-MM-DD" },
      time: { type: "string", description: "HH:MM (24-hour)" },
      phone: { type: "string" },
    },
  },
  resultFields: ["reference", "name", "service", "date", "time"],
  async execute(args, { now }): Promise<ToolResult> {
    ensureDemoBooking(now);
    const date = String(args.date);
    const time = normaliseTime(String(args.time));
    const free = freeTimes(date, now);
    if (!time || free === "past" || free === "closed" || !free.includes(time)) {
      return { ok: false, error: `${date} at ${String(args.time)} is not free.` };
    }
    const booking: Booking = {
      reference: newReference(),
      name: String(args.name),
      service: String(args.service),
      date,
      time,
      phone: String(args.phone),
    };
    bookings.set(booking.reference, booking);
    const { phone: _phone, ...shown } = booking;
    return { ok: true, data: shown };
  },
};

const findBooking: Tool = {
  name: "findBooking",
  description: "Look up a booking by its reference.",
  source: "builtin",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["reference"],
    properties: { reference: { type: "string", description: "e.g. ABC123" } },
  },
  resultFields: ["found", "reference", "name", "service", "date", "time"],
  async execute(args, { now }): Promise<ToolResult> {
    ensureDemoBooking(now);
    const booking = bookings.get(normaliseReference(String(args.reference)));
    if (!booking) return { ok: true, data: { found: false } };
    const { phone: _phone, ...shown } = booking;
    return { ok: true, data: { found: true, ...shown } };
  },
};

const updateBooking: Tool = {
  name: "updateBooking",
  description: "Cancel a booking, or move it to another free date and time.",
  source: "builtin",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["reference", "action"],
    properties: {
      reference: { type: "string" },
      action: { type: "string", enum: ["cancel", "reschedule"] },
      date: { type: "string", description: "YYYY-MM-DD, for reschedule" },
      time: { type: "string", description: "HH:MM (24-hour), for reschedule" },
    },
  },
  resultFields: ["reference", "status", "date", "time"],
  async execute(args, { now }): Promise<ToolResult> {
    ensureDemoBooking(now);
    const reference = normaliseReference(String(args.reference));
    const booking = bookings.get(reference);
    if (!booking) return { ok: false, error: `No booking with reference ${reference}.` };
    if (args.action === "cancel") {
      bookings.delete(reference);
      return { ok: true, data: { reference, status: "cancelled" } };
    }
    const date = String(args.date ?? "");
    const time = normaliseTime(String(args.time ?? ""));
    const free = freeTimes(date, now, reference);
    if (!time || free === "past" || free === "closed" || !free.includes(time)) {
      return { ok: false, error: `${date} at ${String(args.time ?? "")} is not free.` };
    }
    bookings.set(reference, { ...booking, date, time });
    return { ok: true, data: { reference, status: "rescheduled", date, time } };
  },
};

export const BOOKING_TOOLS: Tool[] = [checkAvailability, createBooking, findBooking, updateBooking];

/** Only for tests: forget bookings made so far. */
export function resetMockBookings() {
  bookings.clear();
}

// --- helpers ---------------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIsoDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isoDate(date) === text ? date : null;
}

/** "9:00", "09:00" → "09:00". Null if not a valid HH:MM time. */
function normaliseTime(text: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;
}

function normaliseReference(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function newReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `BK-${code}`;
}

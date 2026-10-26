import type { ConnectionInput } from "@voice-agent/shared";
import { actionsFromOpenApi } from "./connection";
import { assertPublicUrl } from "./network";
import type { NetworkOptions } from "./webhook";

// Connecting a business's app without changing it: given only its website's address, find an
// API the agent can use. Either the site publishes an OpenAPI document, or it runs an app we
// know (a template that describes its public API, the same one its own website calls).

type Template = Omit<ConnectionInput, "baseUrl" | "secret"> & {
  /** What the template is for, shown in the UI. */
  summary: string;
  /** True when the site at `origin` runs this app (checked with harmless GET requests). */
  detect: (origin: string, get: (url: string) => Promise<unknown>) => Promise<boolean>;
  /** The API's base URL for a site origin. */
  baseUrl: (origin: string) => string;
};

const string = (
  name: string,
  description: string,
  required = true,
  where: "query" | "body" = "body",
) => ({
  name,
  in: where,
  type: "string" as const,
  required,
  description,
});

/**
 * Chauffeur and taxi booking (e.g. SignatureMile): places search, fixed-price quotes, bookings,
 * and finding or cancelling a booking by its reference plus the email or phone it was made with.
 */
const CHAUFFEUR_BOOKING: Template = {
  name: "Chauffeur bookings",
  slug: "rides",
  summary: "Find places, give fixed-price quotes, book rides, and find or cancel bookings.",
  authType: "none",
  authHeader: null,
  baseUrl: (origin) => `${origin}/api`,
  detect: async (origin, get) => {
    const vehicles = (await get(`${origin}/api/vehicles`)) as { vehicles?: unknown[] } | null;
    const places = (await get(`${origin}/api/places?q=airport`)) as { places?: unknown[] } | null;
    return Array.isArray(vehicles?.vehicles) && Array.isArray(places?.places);
  },
  actions: [
    {
      name: "search_places",
      description:
        "Find an address, hotel, airport terminal or station. Returns places with label, lat and lng; pass the chosen place to get_quote as pickup or dropoff.",
      method: "GET",
      path: "/places",
      parameters: [
        string(
          "q",
          "What the caller said, e.g. 'Barajas T4' or 'Hotel Ritz Madrid'.",
          true,
          "query",
        ),
      ],
      fixedBody: {},
    },
    {
      name: "list_vehicles",
      description: "The fleet: each vehicle's name, passengers and luggage it takes.",
      method: "GET",
      path: "/vehicles",
      parameters: [],
      fixedBody: {},
    },
    {
      name: "get_quote",
      description:
        "Fixed prices for a journey. Returns a quote id and one option per vehicle (vehicleId, name, price). Quotes expire after a while: book soon after.",
      method: "POST",
      path: "/quotes",
      parameters: [
        string(
          "rideType",
          "one_way, return, hourly, airport, city_to_city or local. Use airport when pickup or dropoff is an airport.",
        ),
        {
          name: "pickup",
          in: "body",
          type: "object",
          required: true,
          description:
            "A place exactly as search_places returned it: { label, lat, lng }. Search first; never invent coordinates.",
        },
        {
          name: "dropoff",
          in: "body",
          type: "object",
          required: false,
          description:
            "A place exactly as search_places returned it: { label, lat, lng }. Search first; never invent coordinates. Not for hourly rides.",
        },
        string("pickupDate", "YYYY-MM-DD"),
        string("pickupTime", "HH:MM, 24-hour, local time"),
        string("returnDate", "YYYY-MM-DD, return rides only", false),
        string("returnTime", "HH:MM, return rides only", false),
        {
          name: "hours",
          in: "body",
          type: "integer",
          required: false,
          description: "Hourly rides only.",
        },
        {
          name: "adults",
          in: "body",
          type: "integer",
          required: true,
          description: "Adult passengers.",
        },
        {
          name: "children",
          in: "body",
          type: "integer",
          required: false,
          description: "Children.",
        },
        {
          name: "luggage",
          in: "body",
          type: "integer",
          required: false,
          description: "Suitcases.",
        },
      ],
      fixedBody: {},
    },
    {
      name: "create_booking",
      description:
        "Book a quoted vehicle. Only after the caller has confirmed the vehicle, price, date and time, and given their name, email and phone. Returns the booking reference.",
      method: "POST",
      path: "/bookings",
      parameters: [
        string("quoteId", "The id from get_quote."),
        string("vehicleId", "The chosen option's vehicleId."),
        {
          name: "contact",
          in: "body",
          type: "object",
          required: true,
          description: "{ name, email, phone, notes? } as the caller gave them.",
        },
        string("flightNumber", "For airport pickups, if the caller knows it.", false),
      ],
      // Business decisions, not the model's: pay the chauffeur, terms accepted by booking by phone.
      fixedBody: { paymentMethod: "chauffeur", acceptTerms: true, locale: "en" },
    },
    {
      name: "find_booking",
      description:
        "Find a booking by its reference and the email or phone number it was made with.",
      method: "POST",
      path: "/bookings/lookup",
      // A POST that only reads: it needs the reference and the booking's email or phone.
      readOnly: true,
      parameters: [
        string("reference", "The booking reference."),
        string("email", "The booking's email address.", false),
        string("phone", "The booking's phone number.", false),
      ],
      fixedBody: {},
    },
    {
      name: "my_bookings",
      description:
        "The caller's upcoming bookings, found by the number they are calling from (filled in automatically): pickup time, places, vehicle and reference. Try this first when they ask about their booking. Needs the business's agent key; if it fails, ask for the reference instead.",
      method: "GET",
      path: "/agent/bookings",
      parameters: [
        {
          name: "phone",
          in: "query",
          type: "string",
          required: true,
          description: "The caller's number.",
          // Filled in by code from the line the call comes from: callers only hear their own.
          source: "caller_phone",
        },
      ],
      fixedBody: {},
    },
    {
      name: "cancel_booking",
      description:
        "Cancel a booking, after the caller has confirmed. Needs the reference and the email or phone number it was made with.",
      method: "POST",
      path: "/bookings/{reference}/cancel",
      parameters: [
        {
          name: "reference",
          in: "path",
          type: "string",
          required: true,
          description: "The booking reference.",
        },
        string("email", "The booking's email address.", false),
        string("phone", "The booking's phone number.", false),
      ],
      fixedBody: {},
    },
  ],
};

export const CONNECTION_TEMPLATES = [CHAUFFEUR_BOOKING];

const OPENAPI_PATHS = [
  "/openapi.json",
  "/api/openapi.json",
  "/swagger.json",
  "/api/swagger.json",
  "/api-docs",
];

export interface DetectedConnection {
  how: "template" | "openapi";
  /** Ready to save once the business adds a name (and a key, if its API needs one). */
  connection: Omit<ConnectionInput, "secret">;
  summary: string;
}

/**
 * What the agent can connect to at a website, found with GET requests only (nothing on the site
 * changes): a known app, or an OpenAPI document at a usual address. Null if neither.
 */
export async function detectConnection(
  siteUrl: string,
  options: NetworkOptions,
): Promise<DetectedConnection | null> {
  const origin = new URL(siteUrl).origin;
  const get = async (url: string): Promise<unknown> => {
    try {
      await assertPublicUrl(url, options);
      const response = await (options.fetch ?? fetch)(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        redirect: "manual",
      });
      if (!response.ok) return null;
      return JSON.parse(await response.text());
    } catch {
      return null;
    }
  };

  for (const template of CONNECTION_TEMPLATES) {
    if (await template.detect(origin, get)) {
      const { detect: _detect, baseUrl, summary, ...connection } = template;
      return { how: "template", summary, connection: { ...connection, baseUrl: baseUrl(origin) } };
    }
  }
  for (const path of OPENAPI_PATHS) {
    const spec = await get(origin + path);
    if (spec && typeof spec === "object" && "paths" in spec) {
      const { baseUrl, actions } = actionsFromOpenApi(spec);
      if (actions.length === 0) continue;
      return {
        how: "openapi",
        summary: `${actions.length} actions from the site's OpenAPI document.`,
        connection: {
          name: new URL(origin).hostname,
          slug: "app",
          baseUrl: baseUrl?.startsWith("http") ? baseUrl : origin + (baseUrl ?? ""),
          authType: "none",
          authHeader: null,
          actions: actions.slice(0, 40),
        },
      };
    }
  }
  return null;
}

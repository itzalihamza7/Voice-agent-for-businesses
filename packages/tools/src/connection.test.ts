import { describe, expect, it, vi } from "vitest";
import type { ConnectionRequestLog } from "@voice-agent/shared";
import { actionsFromOpenApi, connectionTools, requestUrl } from "./connection";

const actions = [
  {
    name: "get_product",
    description: "Look up a product by SKU",
    method: "GET" as const,
    path: "/products/{sku}",
    fixedBody: {},
    parameters: [
      {
        name: "sku",
        in: "path" as const,
        type: "string" as const,
        required: true,
        description: "",
      },
      {
        name: "currency",
        in: "query" as const,
        type: "string" as const,
        required: false,
        description: "",
      },
    ],
  },
  {
    name: "create_order",
    description: "Place an order",
    method: "POST" as const,
    path: "/orders",
    fixedBody: { acceptTerms: true },
    parameters: [
      {
        name: "sku",
        in: "body" as const,
        type: "string" as const,
        required: true,
        description: "",
      },
      {
        name: "quantity",
        in: "body" as const,
        type: "integer" as const,
        required: true,
        description: "",
      },
    ],
  },
];

const network = (fetchMock: typeof fetch) => ({
  allowPrivateHosts: false,
  fetch: fetchMock,
  lookup: async () => ["93.184.216.34"],
});

describe("connection tools", () => {
  it("builds URLs from path and query parameters", () => {
    expect(
      requestUrl("https://shop.example/api/", actions[0]!, { sku: "RG 6L", currency: "GBP" }),
    ).toBe("https://shop.example/api/products/RG%206L?currency=GBP");
    expect(() => requestUrl("https://shop.example", actions[0]!, {})).toThrow("Missing sku");
  });

  it("calls the app with its credential and returns the JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ sku: "RG6" }]));
    const [lookup, order] = connectionTools(
      {
        slug: "chafer",
        name: "Luxury Chafers",
        baseUrl: "https://shop.example/api",
        authHeaders: { "x-api-key": "k" },
        actions,
        writesAllowed: true,
      },
      network(fetchMock),
    );
    expect(lookup!.name).toBe("chafer_get_product");
    expect(lookup!.parameters).toMatchObject({ required: ["sku"] });
    expect(await lookup!.execute({ sku: "RG6" }, { now: new Date() })).toEqual({
      ok: true,
      data: { items: [{ sku: "RG6" }] },
    });
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({ "x-api-key": "k" });

    fetchMock.mockResolvedValue(Response.json({ orderNumber: "1044" }));
    await order!.execute({ sku: "RG6", quantity: 2, acceptTerms: false }, { now: new Date() });
    const init = fetchMock.mock.calls[1]![1]!;
    expect(init.method).toBe("POST");
    // The fixed value is added by code and wins over the AI's arguments.
    expect(JSON.parse(String(init.body))).toEqual({ sku: "RG6", quantity: 2, acceptTerms: true });
  });

  it("refuses private addresses", async () => {
    const [lookup] = connectionTools(
      {
        slug: "x",
        name: "X",
        baseUrl: "http://127.0.0.1:3000",
        authHeaders: {},
        actions,
        writesAllowed: false,
      },
      { allowPrivateHosts: false, fetch: vi.fn<typeof fetch>() },
    );
    expect(await lookup!.execute({ sku: "a" }, { now: new Date() })).toMatchObject({ ok: false });
  });

  it("refuses actions that change data without the business's consent, and logs it", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ sku: "RG6" }));
    const log: ConnectionRequestLog[] = [];
    const [lookup, order] = connectionTools(
      {
        slug: "chafer",
        name: "Chafers",
        baseUrl: "https://shop.example",
        authHeaders: {},
        actions,
        writesAllowed: false,
        onRequest: (entry) => log.push(entry),
      },
      network(fetchMock),
    );
    expect(await lookup!.execute({ sku: "RG6" }, { now: new Date() })).toMatchObject({ ok: true });
    expect(await order!.execute({ sku: "RG6", quantity: 1 }, { now: new Date() })).toMatchObject({
      ok: false,
      error: expect.stringContaining("consent"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toEqual([
      expect.objectContaining({
        action: "get_product",
        path: "/products/RG6",
        status: 200,
        ok: true,
      }),
      expect.objectContaining({ action: "create_order", status: null, ok: false }),
    ]);
  });

  it("fills caller-bound values from the call, never from the AI", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ bookings: [] }));
    const [mine] = connectionTools(
      {
        slug: "rides",
        name: "Rides",
        baseUrl: "https://rides.example/api",
        authHeaders: {},
        writesAllowed: false,
        actions: [
          {
            name: "my_bookings",
            description: "The caller's upcoming bookings",
            method: "GET",
            path: "/agent/bookings",
            fixedBody: {},
            parameters: [
              {
                name: "phone",
                in: "query",
                type: "string",
                required: true,
                description: "",
                source: "caller_phone",
              },
            ],
          },
        ],
      },
      network(fetchMock),
    );
    // The model isn't offered the parameter at all.
    expect(mine!.parameters).toMatchObject({ properties: {}, required: [] });
    await mine!.execute(
      { phone: "+440000000000" },
      { now: new Date(), callerPhone: "+34600111222" },
    );
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://rides.example/api/agent/bookings?phone=%2B34600111222",
    );
    // No caller number (a web chat): the request isn't made.
    expect(await mine!.execute({}, { now: new Date(), callerPhone: null })).toMatchObject({
      ok: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("imports actions from an OpenAPI document", () => {
    const { baseUrl, actions: imported } = actionsFromOpenApi({
      servers: [{ url: "https://shop.example/api" }],
      paths: {
        "/orders/{orderNumber}": {
          get: {
            operationId: "getOrderStatus",
            summary: "Order status",
            parameters: [{ name: "orderNumber", in: "path", schema: { type: "string" } }],
          },
        },
        "/orders": {
          post: {
            operationId: "createOrder",
            summary: "Place an order",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    required: ["sku"],
                    properties: { sku: { type: "string" }, quantity: { type: "integer" } },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(baseUrl).toBe("https://shop.example/api");
    expect(
      imported.map((a) => [
        a.name,
        a.method,
        a.parameters.map((p) => `${p.in}:${p.name}${p.required ? "*" : ""}`),
      ]),
    ).toEqual([
      ["get_order_status", "GET", ["path:orderNumber*"]],
      ["create_order", "POST", ["body:sku*", "body:quantity"]],
    ]);
  });
});

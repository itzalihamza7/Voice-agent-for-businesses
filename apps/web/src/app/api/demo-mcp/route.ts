// A tiny demo MCP (Model Context Protocol) server, to try MCP tools without an outside service.
// Add it in the builder's Tools tab with the URL http://localhost:3000/api/demo-mcp (inside DDEV).
// Its data is made up. Stateless: every request gets a fresh server (no sessions).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

// Made-up exchange rates for the demo.
const PER_EURO: Record<string, number> = { EUR: 1, USD: 1.08, GBP: 0.85, PKR: 300 };

function demoServer() {
  const server = new McpServer({ name: "voice-agent-demo", version: "0.0.0" });
  server.registerTool(
    "loyalty_points",
    {
      description: "Demo: how many loyalty points a customer has, by phone number.",
      inputSchema: { phone: z.string().describe("The customer's phone number") },
    },
    async ({ phone }) => {
      const digits = phone.replace(/\D/g, "");
      const points = digits ? (Number(digits.slice(-4)) % 500) + 20 : 0;
      return {
        content: [{ type: "text", text: JSON.stringify({ phone, points, rewardAt: 500 }) }],
      };
    },
  );
  server.registerTool(
    "convert_currency",
    {
      description: "Demo: convert an amount between EUR, USD, GBP and PKR (made-up rates).",
      inputSchema: {
        amount: z.number(),
        from: z.enum(["EUR", "USD", "GBP", "PKR"]),
        to: z.enum(["EUR", "USD", "GBP", "PKR"]),
      },
    },
    async ({ amount, from, to }) => {
      const converted = Math.round((amount / PER_EURO[from]!) * PER_EURO[to]! * 100) / 100;
      return { content: [{ type: "text", text: JSON.stringify({ amount, from, to, converted }) }] };
    },
  );
  return server;
}

async function handle(request: Request) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await demoServer().connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };

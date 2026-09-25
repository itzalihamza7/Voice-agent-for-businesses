// GET /api/agents/:agentId/phone: the number that reaches this agent.
// PUT /api/agents/:agentId/phone { phoneNumber | null }: set or remove it (one agent per number).
import { DEFAULT_BUSINESS_ID } from "@voice-agent/db";
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { getPrisma } from "@/server/store";

type Context = { params: Promise<{ agentId: string }> };

const PhoneSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Use the international format, e.g. +441632960000")
    .nullable(),
});

export async function GET(_request: Request, { params }: Context) {
  const agent = await getPrisma().agent.findFirst({
    where: { id: (await params).agentId, businessId: DEFAULT_BUSINESS_ID },
    select: { phoneNumber: true },
  });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  return Response.json(agent);
}

export async function PUT(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, PhoneSchema);
  if ("response" in parsed) return parsed.response;
  const { agentId } = await params;
  const { phoneNumber } = parsed.data;
  const prisma = getPrisma();
  if (phoneNumber) {
    const taken = await prisma.agent.findFirst({ where: { phoneNumber, NOT: { id: agentId } } });
    if (taken)
      return Response.json(
        { error: `${phoneNumber} already reaches another agent.` },
        { status: 409 },
      );
  }
  const { count } = await prisma.agent.updateMany({
    where: { id: agentId, businessId: DEFAULT_BUSINESS_ID },
    data: { phoneNumber },
  });
  if (!count) return Response.json({ error: "Agent not found" }, { status: 404 });
  return Response.json({ phoneNumber });
}

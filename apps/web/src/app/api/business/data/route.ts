// GET /api/business/data: how long call data is kept. PUT { retentionDays }: change it (null =
// keep everything); older data is deleted straight away. Owners only (the proxy checks).
import { z } from "zod";
import { currentBusinessId } from "@/server/business";
import { parseJsonBody } from "@/server/http";
import { applyRetention, RETENTION_CHOICES } from "@/server/retention";
import { getPrisma } from "@/server/store";

const RetentionSchema = z.object({
  retentionDays: z
    .number()
    .int()
    .refine((d) => (RETENTION_CHOICES as readonly number[]).includes(d), "Not one of the choices.")
    .nullable(),
});

export async function GET() {
  const business = await getPrisma().business.findUniqueOrThrow({
    where: { id: await currentBusinessId() },
    select: { retentionDays: true, dataKey: true },
  });
  return Response.json({
    retentionDays: business.retentionDays,
    choices: RETENTION_CHOICES,
    ownDataKey: business.dataKey !== null,
  });
}

export async function PUT(request: Request) {
  const parsed = await parseJsonBody(request, RetentionSchema);
  if ("response" in parsed) return parsed.response;
  const businessId = await currentBusinessId();
  await getPrisma().business.update({
    where: { id: businessId },
    data: { retentionDays: parsed.data.retentionDays },
  });
  const deleted = await applyRetention(businessId, { force: true });
  return Response.json({ retentionDays: parsed.data.retentionDays, deleted });
}

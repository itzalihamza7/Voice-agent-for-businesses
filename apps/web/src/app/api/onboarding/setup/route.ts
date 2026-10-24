// POST /api/onboarding/setup { url, businessName, transferNumber, pages }: imports the pages into
// the knowledge base, connects the site's API (if found) and creates a ready phone agent.
import { z } from "zod";
import { currentBusinessId } from "@/server/business";
import { parseJsonBody } from "@/server/http";
import { setUpFromWebsite } from "@/server/onboarding";

const SetupSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  businessName: z.string().trim().min(1).max(80),
  transferNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Use the international format, e.g. +34600000000")
    .nullable(),
  pages: z.array(z.url()).max(25),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, SetupSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const result = await setUpFromWebsite(await currentBusinessId(), parsed.data);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

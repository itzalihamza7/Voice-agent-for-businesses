// POST /api/onboarding/scan { url }: what can be set up from a website, with GET requests only:
// the pages its sitemap lists and the API its app offers (a known app or an OpenAPI document).
import { z } from "zod";
import { parseJsonBody } from "@/server/http";
import { scanWebsite } from "@/server/onboarding";

const ScanSchema = z.object({ url: z.url({ protocol: /^https?$/ }) });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, ScanSchema);
  if ("response" in parsed) return parsed.response;
  try {
    return Response.json(await scanWebsite(parsed.data.url));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}

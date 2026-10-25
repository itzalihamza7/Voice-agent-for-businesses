// GET /api/widget/:publicId?host=<page host>: what the chat button needs (title and colour).
// Public, and readable from any site (the snippet runs on the business's website). For a host
// that isn't allowed it answers 404, so no button appears there; the chat window itself is also
// refused by browsers on such sites (frame-ancestors).
import { hostAllowed } from "@voice-agent/shared";
import { publicConfig, widgetHosts } from "@/server/widget";

type Context = { params: Promise<{ publicId: string }> };

const CORS = { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" };

export async function GET(request: Request, { params }: Context) {
  const { publicId } = await params;
  const host = new URL(request.url).searchParams.get("host");
  const allowed = host === null || hostAllowed(host, (await widgetHosts(publicId)) ?? []);
  const config = allowed ? await publicConfig(publicId) : null;
  return config
    ? Response.json(config, { headers: CORS })
    : Response.json({ error: "Not available" }, { status: 404, headers: CORS });
}

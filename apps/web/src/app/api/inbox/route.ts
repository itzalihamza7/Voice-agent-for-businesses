// GET /api/inbox?filter=attention|all&q=…: the business's website chats, newest first, and how
// many hand-offs are waiting for the team.
import { currentBusinessId } from "@/server/business";
import { attentionCount, inboxList } from "@/server/web-chats";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const businessId = await currentBusinessId();
  const filter = url.searchParams.get("filter") === "all" ? "all" : "attention";
  const [items, attention] = await Promise.all([
    inboxList(businessId, filter, url.searchParams.get("q") ?? undefined),
    attentionCount(businessId),
  ]);
  return Response.json({ items, attention });
}

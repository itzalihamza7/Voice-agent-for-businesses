// GET /api/inbox/count: hand-offs waiting for the team (the sidebar badge).
import { currentBusinessId } from "@/server/business";
import { attentionCount } from "@/server/web-chats";

export async function GET() {
  return Response.json({ count: await attentionCount(await currentBusinessId()) });
}

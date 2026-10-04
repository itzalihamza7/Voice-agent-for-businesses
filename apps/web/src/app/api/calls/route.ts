// GET /api/calls: the business's recent calls with their analysis, newest first.
import { callStats, listCalls } from "@/server/call-log";

export async function GET() {
  const calls = await listCalls();
  return Response.json({ calls, stats: callStats(calls) });
}

// GET /api/calls: call logs for the dashboard.
// It stays thin: parse the request, call @voice-agent/orchestrator, return JSON.

export function GET() {
  return Response.json({ error: "Not implemented yet" }, { status: 501 });
}

// GET /api/agents/:agentId/versions: list config versions. POST: save a new version.
// It stays thin: parse the request, call @voice-agent/orchestrator, return JSON.

export function GET() {
  return Response.json({ error: "Not implemented yet" }, { status: 501 });
}

// POST /api/sessions: start a voice session for an agent (browser test calls).
// It stays thin: parse the request, call @voice-agent/orchestrator, return JSON.

export function POST() {
  return Response.json({ error: "Not implemented yet" }, { status: 501 });
}

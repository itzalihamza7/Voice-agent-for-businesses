// POST /api/tools { webhooks, mcpServers }: every tool the agent can use, for the builder.
// MCP servers are connected live to list their tools; unreachable ones are reported as problems.
import { toolInfo } from "@voice-agent/tools";
import { AgentToolsSchema } from "@voice-agent/shared";
import { parseJsonBody } from "@/server/http";
import { currentBusinessId } from "@/server/business";
import { loadTools } from "@/server/tools";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, AgentToolsSchema);
  if ("response" in parsed) return parsed.response;

  const resolved = await loadTools(parsed.data, await currentBusinessId());
  try {
    return Response.json({
      tools: [...resolved.tools.values()].map(toolInfo),
      problems: resolved.problems,
    });
  } finally {
    await resolved.close();
  }
}

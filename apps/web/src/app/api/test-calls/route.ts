// POST /api/test-calls { flow, models, prompt, tools, contextBudget, callerPhone }: starts a test
// call. The call is a LangGraph thread saved on the server; the reply has its id, its state and
// what happened. Continue it with POST /api/test-calls/:callId.
import { ConversationError } from "@voice-agent/orchestrator";
import { ProviderConfigError } from "@voice-agent/pipeline";
import { StartTestCallSchema } from "@voice-agent/shared";
import { getCallSessions } from "@/server/calls";
import { currentBusinessId } from "@/server/business";
import { conversationDeps } from "@/server/conversation";
import { parseJsonBody } from "@/server/http";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, StartTestCallSchema);
  if ("response" in parsed) return parsed.response;
  const { flow, callerPhone, agentId, agentVersion, ...settings } = parsed.data;
  let close = async () => {};
  try {
    const built = await conversationDeps(settings, await currentBusinessId());
    close = built.close;
    const callId = crypto.randomUUID();
    const result = await (
      await getCallSessions()
    ).start(callId, flow, built.deps, {
      source: "test",
      ...(agentId ? { agentId } : {}),
      ...(agentVersion ? { agentVersion } : {}),
      ...(callerPhone ? { callerPhone } : {}),
    });
    return Response.json({ callId, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof ConversationError || error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  } finally {
    await close();
  }
}

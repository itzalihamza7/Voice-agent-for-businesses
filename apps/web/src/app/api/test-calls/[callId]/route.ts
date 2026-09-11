// POST /api/test-calls/:callId { action, models, prompt, tools, contextBudget }: the caller
// speaks (or a path is picked by hand). Resumes the call's LangGraph thread until it needs the
// caller again, and returns the new state and what happened.
import { ConversationError } from "@voice-agent/orchestrator";
import { ProviderConfigError } from "@voice-agent/pipeline";
import { TestCallActionSchema } from "@voice-agent/shared";
import { getCallSessions } from "@/server/calls";
import { conversationDeps } from "@/server/conversation";
import { parseJsonBody } from "@/server/http";

type Context = { params: Promise<{ callId: string }> };

export async function POST(request: Request, { params }: Context) {
  const parsed = await parseJsonBody(request, TestCallActionSchema);
  if ("response" in parsed) return parsed.response;
  const { action, ...settings } = parsed.data;
  let close = async () => {};
  try {
    const built = await conversationDeps(settings);
    close = built.close;
    const result = await (await getCallSessions()).send((await params).callId, action, built.deps);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ConversationError || error instanceof ProviderConfigError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  } finally {
    await close();
  }
}

// POST /api/widget/:publicId/chats: a visitor opens the chat. Starts a conversation with the
// agent's live version and returns the chat's id, its token and the agent's first words.
import { getCallSessions } from "@/server/calls";
import { countUsage, chatToken, underCostCap, widgetAgent, activeWidget } from "@/server/widget";
import {
  busyMessage,
  chatError,
  json,
  recordWebTurn,
  visible,
  widgetDeps,
} from "@/server/widget-chat";

type Context = { params: Promise<{ publicId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { publicId } = await params;
  const widget = await activeWidget(publicId);
  if (!widget) return json({ error: "This chat isn't available." }, 404);
  if (!(await underCostCap(widget))) return json({ error: busyMessage }, 429);
  const agent = await widgetAgent(widget);
  if (!agent) return json({ error: "This chat isn't available." }, 404);

  const chatId = crypto.randomUUID();
  let close = async () => {};
  try {
    const built = await widgetDeps(widget, agent.version, chatId);
    close = built.close;
    const result = await (
      await getCallSessions()
    ).start(chatId, built.flow, built.deps, {
      source: "web",
      agentId: widget.agentId,
      agentVersion: agent.version,
    });
    await Promise.all([recordWebTurn(chatId, result), countUsage(widget.agentId, result, true)]);
    return json({ chatId, token: chatToken(publicId, chatId), ...visible(result) }, 201);
  } catch (error) {
    return chatError(error);
  } finally {
    await close();
  }
}

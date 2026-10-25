import { ConversationError } from "@voice-agent/orchestrator";
import { ProviderConfigError } from "@voice-agent/pipeline";
import { spokenLines, type TurnResult } from "@voice-agent/shared";
import { recordWebTurn } from "./call-log";
import { getCallSessions } from "./calls";
import { conversationDeps } from "./conversation";
import { getAgentConfigStore } from "./store";
import { activeWidget, MAX_CHAT_MESSAGES, tokenValid, underCostCap, widgetModel } from "./widget";

// Shared steps of the public chat routes: find the widget, check the visitor's chat, build the
// conversation, and answer with only what the visitor should see (the agent's words), never the
// call's state, tool results or trace.

export type Widget = NonNullable<Awaited<ReturnType<typeof activeWidget>>>;

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** What a visitor sees of a turn. */
export function visible(result: TurnResult) {
  return { replies: spokenLines(result.events), ended: result.state.nodeId === null };
}

/** The deps for one turn of a widget chat, with the given version of the agent. */
export async function widgetDeps(widget: Widget, version: number, chatId: string) {
  const config = await (
    await getAgentConfigStore(widget.businessId)
  ).getVersion(widget.agentId, version);
  if (!config) throw new ConversationError("This agent version no longer exists.");
  const model = widgetModel();
  const built = await conversationDeps(
    {
      models: { decisions: model, replies: model, fallback: null },
      prompt: config.prompt,
      tools: config.tools,
    },
    widget.businessId,
    chatId,
  );
  return { ...built, flow: config.flow };
}

/**
 * Checks a visitor may continue a chat: the widget is on, the token is this chat's, the chat
 * belongs to this widget, it isn't over its length, and today's cost is under the cap.
 */
export async function openChat(
  publicId: string,
  chatId: string,
  token: string,
): Promise<{ widget: Widget; version: number } | Response> {
  const widget = await activeWidget(publicId);
  if (!widget) return json({ error: "This chat isn't available." }, 404);
  if (!tokenValid(publicId, chatId, token)) return json({ error: "Unknown chat." }, 403);
  const history = await (await getCallSessions()).history(chatId);
  if (!history || history.meta.source !== "web" || history.meta.agentId !== widget.agentId) {
    return json({ error: "Unknown chat." }, 404);
  }
  if (history.state.nodeId === null) return json({ error: "This chat has ended." }, 409);
  const messages = history.state.transcript.filter((e) => e.role === "caller").length;
  if (messages >= MAX_CHAT_MESSAGES) {
    return json({ error: "This chat is very long. Please start a new one." }, 429);
  }
  if (!(await underCostCap(widget))) return json({ error: busyMessage }, 429);
  return { widget, version: history.meta.agentVersion ?? 0 };
}

export const busyMessage =
  "The assistant is very busy right now. Please try again later or contact us directly.";

/** Known errors as JSON; anything else is logged and hidden from visitors. */
export function chatError(error: unknown): Response {
  if (error instanceof ConversationError || error instanceof ProviderConfigError) {
    return json({ error: error.message }, 400);
  }
  console.error("Widget chat failed:", error);
  return json({ error: "Something went wrong. Please try again." }, 502);
}

export { recordWebTurn };

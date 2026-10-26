import { ConversationError, type ProgressUpdate } from "@voice-agent/orchestrator";
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

/** What a visitor sees of a turn. A Transfer step means "offer the ways to reach the team". */
export function visible(result: TurnResult) {
  return {
    replies: spokenLines(result.events),
    ended: result.state.nodeId === null,
    handoffSuggested: result.events.some((e) => e.type === "transfer"),
  };
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
  // Typed chats are read: the agent writes "€60" and "LX-7ZTAM3", not the spoken forms.
  return { ...built, deps: { ...built.deps, channel: "text" as const }, flow: config.flow };
}

export interface OpenChat {
  widget: Widget;
  version: number;
  /** The flow has ended: the AI won't answer again (a person still can). */
  ended: boolean;
  /** Messages the visitor has sent the AI. */
  messages: number;
}

/** Checks a visitor's chat: the widget is on, the token is this chat's, and it is this widget's. */
export async function openChat(
  publicId: string,
  chatId: string,
  token: string,
): Promise<OpenChat | Response> {
  const widget = await activeWidget(publicId);
  if (!widget) return json({ error: "This chat isn't available." }, 404);
  if (!tokenValid(publicId, chatId, token)) return json({ error: "Unknown chat." }, 403);
  const history = await (await getCallSessions()).history(chatId);
  if (!history || history.meta.source !== "web" || history.meta.agentId !== widget.agentId) {
    return json({ error: "Unknown chat." }, 404);
  }
  return {
    widget,
    version: history.meta.agentVersion ?? 0,
    ended: history.state.nodeId === null,
    messages: history.state.transcript.filter((e) => e.role === "caller").length,
  };
}

/** May the AI answer now? Not after the flow ended, in a very long chat, or over the cost cap. */
export async function aiRefusal(chat: OpenChat): Promise<Response | null> {
  if (chat.ended) return json({ error: "This chat has ended. Start a new one to continue." }, 409);
  if (chat.messages >= MAX_CHAT_MESSAGES) {
    return json({ error: "This chat is very long. Please start a new one." }, 429);
  }
  if (!(await underCostCap(chat.widget))) return json({ error: busyMessage }, 429);
  return null;
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

// ----- Streaming ----------------------------------------------------------------------------------

/** What visitors see while the agent works: plain words, never tool or step names. */
export function statusFor(update: Extract<ProgressUpdate, { type: "step" }>): string {
  if (update.step === "deciding") return "Reading your message";
  if (update.step === "searching") return "Checking our information";
  if (update.step === "writing") return "Writing a reply";
  const tool = update.detail ?? "";
  const known: [RegExp, string][] = [
    [/search_places|places/, "Looking up the address"],
    [/list_vehicles|vehicles|fleet/, "Checking the fleet"],
    [/quote|price/, "Getting a price"],
    [/create_booking|book_appointment|create_reservation|createBooking/, "Making your booking"],
    [/cancel/, "Cancelling the booking"],
    [/find_booking|my_bookings|lookup/, "Finding your booking"],
    [/availability|slots|tables/, "Checking availability"],
  ];
  return known.find(([pattern]) => pattern.test(tool))?.[1] ?? "Checking with our system";
}

/**
 * Runs a turn and answers as server-sent events: "status" (what the agent is doing), "text"
 * (each checked sentence of the reply as it is written) and finally "done" (what the visitor
 * sees, the same as the JSON answer) or "error".
 */
export function streamTurn(
  run: (onProgress: (update: ProgressUpdate) => void) => Promise<Record<string, unknown>>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The visitor may leave mid-turn: the turn still finishes and is saved (they see it when
      // they reopen the chat), so writing to a closed stream is simply skipped, never thrown.
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      let lastStatus = "";
      try {
        const done = await run((update) => {
          if (update.type === "text") return send("text", { text: update.text });
          const status = statusFor(update);
          if (status !== lastStatus) send("status", { status });
          lastStatus = status;
        });
        send("done", done);
      } catch (error) {
        const answer = chatError(error);
        send("error", await answer.json());
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // Already closed by the visitor leaving.
          }
        }
      }
    },
    cancel() {
      // The visitor left; the turn carries on (see send).
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // Proxies (nginx, Caddy) must pass events on as they come, not buffer them.
      "x-accel-buffering": "no",
    },
  });
}

/** True if the visitor's browser asked for a stream. */
export const wantsStream = (request: Request) =>
  (request.headers.get("accept") ?? "").includes("text/event-stream");

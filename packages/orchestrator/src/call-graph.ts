import {
  Annotation,
  Command,
  END,
  interrupt,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type {
  AgentFlow,
  ConversationAction,
  ConversationEvent,
  ConversationState,
  TurnResult,
} from "@voice-agent/shared";
import { ConversationError, runTurn, type ConversationDeps } from "./conversation";

// A call as a LangGraph graph. LangGraph owns the call's lifecycle and state: each call is a
// thread, its state is saved by a checkpointer (Postgres in the app) after every step, and
// waiting for the caller is an interrupt that the next request resumes. The flow's steps are
// still run by our engine (runTurn), one turn per graph step:
//
//   START → turn ──(call over)──▶ END
//            ▲  └─(waiting)──▶ listen ── interrupt() ── caller speaks ──┐
//            └─────────────────────────────────────────────────────────┘
//
// The graph is compiled per request with that request's models and tools in a closure, so
// nothing secret (API clients, keys) ever ends up in a checkpoint. Only the flow, the call state
// and the last turn's events are saved.

const CallState = Annotation.Root({
  /** The flow as it was when the call started; edits on the canvas don't change a running call. */
  flow: Annotation<AgentFlow>(),
  conversation: Annotation<ConversationState | null>(),
  /** What happened in the last turn: what the chat (or voice) shows and says. */
  events: Annotation<ConversationEvent[]>(),
  /** The caller's next action, set when the call resumes. */
  pending: Annotation<ConversationAction | null>(),
});

type CallStateValues = typeof CallState.State;

function buildCallGraph(deps: ConversationDeps, checkpointer: BaseCheckpointSaver) {
  return new StateGraph(CallState)
    .addNode("turn", async (state: CallStateValues) => {
      const action = state.pending ?? { type: "start" };
      try {
        const result = await runTurn(state.flow, state.conversation, action, deps);
        return { conversation: result.state, events: result.events, pending: null };
      } catch (error) {
        // An action that doesn't fit (e.g. an answer while a path must be picked) leaves the
        // call where it was and explains why.
        if (!(error instanceof ConversationError)) throw error;
        const nodeId = state.conversation?.nodeId ?? undefined;
        return {
          events: [{ type: "stuck", ...(nodeId ? { nodeId } : {}), message: error.message }],
          pending: null,
        } satisfies Partial<CallStateValues>;
      }
    })
    .addNode("listen", (state: CallStateValues) => {
      const action = interrupt({ waitingFor: state.conversation?.waitingFor ?? null });
      return { pending: action as ConversationAction };
    })
    .addEdge(START, "turn")
    .addConditionalEdges("turn", (state: CallStateValues) =>
      state.conversation?.nodeId === null ? END : "listen",
    )
    .addEdge("listen", "turn")
    .compile({ checkpointer });
}

/** Calls kept by a LangGraph checkpointer, one thread per call id. */
export class CallSessions {
  constructor(private readonly checkpointer: BaseCheckpointSaver) {}

  /** Starts a call: runs the flow until it first needs the caller. */
  async start(
    callId: string,
    flow: AgentFlow,
    deps: ConversationDeps,
    callerPhone?: string,
  ): Promise<TurnResult> {
    const graph = buildCallGraph(deps, this.checkpointer);
    const config = { configurable: { thread_id: callId } };
    const action: ConversationAction = { type: "start", ...(callerPhone ? { callerPhone } : {}) };
    await graph.invoke({ flow, conversation: null, events: [], pending: action }, config);
    return this.result(graph, config);
  }

  /** The caller speaks (or a path is picked): resumes the call until it needs the caller again. */
  async send(
    callId: string,
    action: ConversationAction,
    deps: ConversationDeps,
  ): Promise<TurnResult> {
    const graph = buildCallGraph(deps, this.checkpointer);
    const config = { configurable: { thread_id: callId } };
    const current = await graph.getState(config);
    if (!current.values || Object.keys(current.values).length === 0) {
      throw new ConversationError("There is no call with this id.");
    }
    if (!current.next.includes("listen")) throw new ConversationError("The call is already over.");
    await graph.invoke(new Command({ resume: action }), config);
    return this.result(graph, config);
  }

  /** The call's current state, or null if there is no such call. */
  async get(callId: string): Promise<{ flow: AgentFlow; state: ConversationState } | null> {
    const graph = buildCallGraph({ decisions: null, replies: null }, this.checkpointer);
    const snapshot = await graph.getState({ configurable: { thread_id: callId } });
    const values = snapshot.values as Partial<CallStateValues>;
    return values.flow && values.conversation
      ? { flow: values.flow, state: values.conversation }
      : null;
  }

  private async result(
    graph: ReturnType<typeof buildCallGraph>,
    config: { configurable: { thread_id: string } },
  ): Promise<TurnResult> {
    const values = (await graph.getState(config)).values as CallStateValues;
    if (!values.conversation) throw new ConversationError("The call didn't start.");
    return { state: values.conversation, events: values.events };
  }
}

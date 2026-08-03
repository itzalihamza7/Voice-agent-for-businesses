import {
  BRANCH_ELSE_HANDLE,
  renderTemplate,
  type AgentFlow,
  type ConversationAction,
  type ConversationEvent,
  type ConversationState,
  type FlowNode,
  type TurnResult,
} from "@voice-agent/shared";

// Walks a conversation through a flow. Pure functions: the caller keeps the state between
// turns (the test chat keeps it in the browser), so nothing is stored here.
//
// Each turn runs steps automatically until the flow needs the caller:
//   - Ask: waits for the caller's answer, then stores it in the step's variable.
//   - Branch: waits for a path to be chosen (picked by hand in the test chat today;
//     an LLM will choose it from what the caller said in roadmap phase 4).
// AI response, Tool and Knowledge lookup steps are only reported for now; later phases run them.

// A loop of steps that never wait for the caller would otherwise run forever.
const MAX_STEPS_PER_TURN = 200;

/** The action doesn't fit the conversation's state, e.g. an answer while waiting at a Branch. */
export class ConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationError";
  }
}

export function runTurn(
  flow: AgentFlow,
  state: ConversationState | null,
  action: ConversationAction,
): TurnResult {
  if (action.type === "start") return startConversation(flow);
  if (!state || state.nodeId === null) throw new ConversationError("The call is already over.");

  const node = flow.nodes.find((n) => n.id === state.nodeId);
  if (action.type === "answer") {
    if (node?.type !== "ask") throw new ConversationError("The agent isn't waiting for an answer.");
    const value = action.text;
    const variables = { ...state.variables, [node.data.variable]: value };
    const events: ConversationEvent[] = [
      { type: "answer", nodeId: node.id, variable: node.data.variable, value },
    ];
    return continueAfter(flow, node, undefined, variables, events);
  }

  if (node?.type !== "branch") throw new ConversationError("The agent isn't at a Branch.");
  const path = branchPaths(node).find((p) => p.handle === action.handle);
  if (!path) throw new ConversationError(`This Branch has no path "${action.handle}".`);
  const events: ConversationEvent[] = [{ type: "pathChosen", nodeId: node.id, label: path.label }];
  return continueAfter(flow, node, path.handle, state.variables, events);
}

function startConversation(flow: AgentFlow): TurnResult {
  const start = flow.nodes.find((node) => node.type === "start");
  if (!start) {
    return finished({}, [{ type: "stuck", message: "The flow has no Start step." }]);
  }
  return continueAfter(flow, start, undefined, {}, []);
}

/** Follows the connection leaving `node` (through `handle` for Branches) and runs on from there. */
function continueAfter(
  flow: AgentFlow,
  node: FlowNode,
  handle: string | undefined,
  variables: Record<string, string>,
  events: ConversationEvent[],
): TurnResult {
  let current: FlowNode | undefined = next(flow, node, handle, events);

  for (let steps = 0; current; steps++) {
    if (steps >= MAX_STEPS_PER_TURN) {
      events.push({
        type: "stuck",
        nodeId: current.id,
        message: "The flow keeps looping without waiting for the caller.",
      });
      return finished(variables, events);
    }

    const text = (template: string) => renderTemplate(template, variables);
    switch (current.type) {
      case "start":
        break;
      case "say":
        events.push({ type: "say", nodeId: current.id, text: text(current.data.text) });
        break;
      case "ask":
        events.push({
          type: "ask",
          nodeId: current.id,
          question: text(current.data.question),
          variable: current.data.variable,
        });
        return { state: { nodeId: current.id, variables }, events };
      case "aiResponse":
        events.push({
          type: "aiResponse",
          nodeId: current.id,
          instructions: current.data.instructions,
        });
        break;
      case "tool":
        events.push({ type: "tool", nodeId: current.id, toolName: current.data.toolName });
        break;
      case "knowledgeLookup":
        events.push({
          type: "knowledgeLookup",
          nodeId: current.id,
          query: text(current.data.query),
        });
        break;
      case "branch":
        events.push({ type: "branch", nodeId: current.id, paths: branchPaths(current) });
        return { state: { nodeId: current.id, variables }, events };
      case "transfer":
        events.push({
          type: "transfer",
          nodeId: current.id,
          phoneNumber: current.data.phoneNumber,
          message: text(current.data.message),
        });
        return finished(variables, events);
      case "end":
        events.push({ type: "end", nodeId: current.id, message: text(current.data.message) });
        return finished(variables, events);
    }
    current = next(flow, current, undefined, events);
  }
  // `next` already explained why there is no next step.
  return finished(variables, events);
}

/** The step after `node`, or undefined (with a "stuck" event explaining why). */
function next(
  flow: AgentFlow,
  node: FlowNode,
  handle: string | undefined,
  events: ConversationEvent[],
): FlowNode | undefined {
  const edge = flow.edges.find(
    (e) => e.source === node.id && (handle === undefined || e.sourceHandle === handle),
  );
  const target = edge && flow.nodes.find((n) => n.id === edge.target);
  if (!target) {
    events.push({
      type: "stuck",
      nodeId: node.id,
      message: "Nothing is connected after this step, so the call can't continue.",
    });
  }
  return target;
}

function branchPaths(node: Extract<FlowNode, { type: "branch" }>) {
  return [
    ...node.data.conditions.map((c, index) => ({
      handle: c.id,
      label: c.label.trim() || `Path ${index + 1}`,
    })),
    { handle: BRANCH_ELSE_HANDLE, label: "Otherwise" },
  ];
}

function finished(variables: Record<string, string>, events: ConversationEvent[]): TurnResult {
  return { state: { nodeId: null, variables }, events };
}

import { BRANCH_ELSE_HANDLE, type AgentFlow, type FlowEdge, type FlowNode } from "./flow";
import { BUILT_IN_VARIABLES } from "./prompt";
import { unknownVariables } from "./template";

// Checks whether a flow is complete enough to run: every step filled in, connected and
// reachable. Drafts with issues can still be saved; the builder shows the issues on the
// canvas, and later phases will refuse to put a flow with issues live.

export interface FlowIssue {
  message: string;
  nodeId?: string;
  edgeId?: string;
}

// Letters, digits and underscores, not starting with a digit: usable later as {{variable}}.
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// International (E.164) format, e.g. +14155550123.
const PHONE_NUMBER = /^\+[1-9]\d{6,14}$/;

const TERMINAL_TYPES = new Set<FlowNode["type"]>(["end", "transfer"]);

export function validateFlow(flow: AgentFlow): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));

  const starts = flow.nodes.filter((node) => node.type === "start");
  if (starts.length === 0) issues.push({ message: "Add a Start node: every call begins there." });
  for (const extra of starts.slice(1)) {
    issues.push({ nodeId: extra.id, message: "Only one Start node is allowed." });
  }

  const validEdges: FlowEdge[] = [];
  for (const edge of flow.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      issues.push({ edgeId: edge.id, message: "Connection points to a step that doesn't exist." });
    } else {
      validEdges.push(edge);
    }
  }

  const askVariables = new Map<string, string>();
  for (const node of flow.nodes) {
    issues.push(...checkSettings(node, askVariables));
    issues.push(...checkConnections(node, validEdges));
  }

  issues.push(...checkVariables(flow));

  const start = starts[0];
  if (start) {
    const reachable = reachableFrom(start.id, validEdges);
    for (const node of flow.nodes) {
      if (!reachable.has(node.id)) {
        issues.push({
          nodeId: node.id,
          message: "Not reachable from Start: connect a step to it.",
        });
      }
    }
  }
  return issues;
}

/** {{variables}} must be an Ask step's variable or a built-in one ({{business_name}}, {{today}}). */
function checkVariables(flow: AgentFlow): FlowIssue[] {
  const known = new Set<string>(BUILT_IN_VARIABLES);
  for (const node of flow.nodes) {
    if (node.type === "ask" && node.data.variable) {
      known.add(node.data.variable);
      // Dates and times also get an easy-to-say version, e.g. {{preferred_date_spoken}}.
      if (node.data.answerType === "date" || node.data.answerType === "time") {
        known.add(`${node.data.variable}_spoken`);
      }
    }
  }
  return flow.nodes.flatMap((node) =>
    unknownVariables(templateText(node), known).map((name) => ({
      nodeId: node.id,
      message: `{{${name}}} isn't a known variable: check the spelling, or add an Ask step that saves it.`,
    })),
  );
}

/** All text of a step that is filled with {{variables}}. */
function templateText(node: FlowNode): string {
  switch (node.type) {
    case "say":
      return node.data.text;
    case "ask":
      return node.data.question;
    case "aiResponse":
      return node.data.instructions;
    case "knowledgeLookup":
      return node.data.query;
    case "transfer":
    case "end":
      return node.data.message;
    default:
      return "";
  }
}

function checkSettings(node: FlowNode, askVariables: Map<string, string>): FlowIssue[] {
  const issue = (message: string): FlowIssue[] => [{ nodeId: node.id, message }];
  switch (node.type) {
    case "start":
    case "end":
      return [];
    case "say":
      return node.data.text.trim() ? [] : issue("Say: enter what the agent should say.");
    case "ask": {
      const found: FlowIssue[] = [];
      if (!node.data.question.trim()) found.push(...issue("Ask: enter the question."));
      const variable = node.data.variable;
      if (!VARIABLE_NAME.test(variable)) {
        found.push(
          ...issue("Ask: the variable name must use letters, digits or _ (e.g. order_number)."),
        );
      } else if (askVariables.has(variable)) {
        found.push(
          ...issue(`Ask: the variable "${variable}" is already used by another Ask step.`),
        );
      } else {
        askVariables.set(variable, node.id);
      }
      return found;
    }
    case "aiResponse":
      return node.data.instructions.trim()
        ? []
        : issue("AI response: describe what the AI should do.");
    case "branch":
      if (node.data.conditions.length === 0) return issue("Branch: add at least one condition.");
      return node.data.conditions.some((c) => !c.label.trim())
        ? issue("Branch: every condition needs a description.")
        : [];
    case "tool":
      return node.data.toolName.trim() ? [] : issue("Tool: choose which tool to call.");
    case "knowledgeLookup":
      return node.data.query.trim() ? [] : issue("Knowledge lookup: describe what to look up.");
    case "transfer":
      return PHONE_NUMBER.test(node.data.phoneNumber)
        ? []
        : issue("Transfer: enter the phone number in international format, e.g. +14155550123.");
  }
}

function checkConnections(node: FlowNode, edges: FlowEdge[]): FlowIssue[] {
  const issue = (message: string): FlowIssue[] => [{ nodeId: node.id, message }];
  const outgoing = edges.filter((edge) => edge.source === node.id);

  if (node.type === "start" && edges.some((edge) => edge.target === node.id)) {
    return issue("Nothing can connect into Start.");
  }

  if (TERMINAL_TYPES.has(node.type)) {
    return outgoing.length > 0 ? issue("This step ends the call, so nothing can follow it.") : [];
  }

  if (node.type === "branch") {
    const found: FlowIssue[] = [];
    const outputs = [
      ...node.data.conditions.map((c) => ({ handle: c.id, label: c.label.trim() || "unnamed" })),
      { handle: BRANCH_ELSE_HANDLE, label: "Otherwise" },
    ];
    for (const { handle, label } of outputs) {
      const count = outgoing.filter((edge) => edge.sourceHandle === handle).length;
      if (count === 0) found.push(...issue(`Branch: connect the "${label}" path.`));
      if (count > 1)
        found.push(...issue(`Branch: the "${label}" path has more than one connection.`));
    }
    const known = new Set(outputs.map((output) => output.handle));
    for (const edge of outgoing) {
      if (!edge.sourceHandle || !known.has(edge.sourceHandle)) {
        found.push({ edgeId: edge.id, message: "Branch: connection leaves from an unknown path." });
      }
    }
    return found;
  }

  if (outgoing.length === 0) {
    return issue("Nothing happens after this step: connect it to the next one.");
  }
  if (outgoing.length > 1) {
    return issue("Only one connection can leave this step. Use a Branch to split the call.");
  }
  return [];
}

function reachableFrom(startId: string, edges: FlowEdge[]): Set<string> {
  const reached = new Set([startId]);
  const queue = [startId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of edges) {
      if (edge.source === id && !reached.has(edge.target)) {
        reached.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return reached;
}

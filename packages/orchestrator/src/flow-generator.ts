import { llmCallInfo, type LanguageModelProvider } from "@voice-agent/pipeline";
import {
  AgentFlowSchema,
  ANSWER_TYPES,
  BRANCH_ELSE_HANDLE,
  DEFAULT_PROMPT_SETTINGS,
  validateFlow,
  type AgentFlow,
  type FlowIssue,
  type LlmCallInfo,
  type PromptSettings,
} from "@voice-agent/shared";
import { z } from "zod";

// The AI flow generator: a plain-English description becomes a builder flow. The model fills in
// a simple outline (steps, what each says, where each goes next); code turns it into nodes and
// edges, lays them out, and checks the result with the same validateFlow the builder uses. If
// that finds issues, the model gets one try to fix them.

const STEP_TYPES = [
  "say",
  "ask",
  "aiResponse",
  "branch",
  "knowledgeLookup",
  "transfer",
  "end",
] as const;

const OutlineSchema = z.object({
  name: z.string(),
  businessName: z.string(),
  role: z.string(),
  steps: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(STEP_TYPES),
        text: z.string().nullable(),
        variable: z.string().nullable(),
        answerType: z.enum(ANSWER_TYPES).nullable(),
        phoneNumber: z.string().nullable(),
        next: z.string().nullable(),
        paths: z.array(z.object({ label: z.string(), next: z.string() })).nullable(),
      }),
    )
    .min(1)
    .max(30),
});

type Outline = z.infer<typeof OutlineSchema>;

const OUTLINE_JSON_SCHEMA = {
  name: "agent_outline",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "businessName", "role", "steps"],
    properties: {
      name: { type: "string" },
      businessName: { type: "string" },
      role: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "type",
            "text",
            "variable",
            "answerType",
            "phoneNumber",
            "next",
            "paths",
          ],
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: [...STEP_TYPES] },
            text: { type: ["string", "null"] },
            variable: { type: ["string", "null"] },
            answerType: { type: ["string", "null"], enum: [...ANSWER_TYPES, null] },
            phoneNumber: { type: ["string", "null"] },
            next: { type: ["string", "null"] },
            paths: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "next"],
                properties: { label: { type: "string" }, next: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

const INSTRUCTIONS = [
  "You design phone agents as flows of steps. From the business's description, write the flow",
  "as JSON. Step types and what `text` means for each:",
  '- "say": a fixed sentence the agent says. text = the sentence.',
  '- "ask": a question; the answer is saved in `variable` (snake_case) with an `answerType`',
  "  (text, name, phone, email, date, time, number, yesNo). text = the question.",
  '- "aiResponse": the AI writes a reply. text = instructions for it.',
  '- "branch": choose a path from what the caller says. `paths` = [{ label: "The caller wants',
  '  to book", next: "<step id>" }, ...]; add a last path labelled "Otherwise". text = null.',
  '- "knowledgeLookup": search the business\'s documents. text = the topic to look up.',
  '- "transfer": hand the call to a person. phoneNumber in international format (+44...).',
  "  text = what to say first.",
  '- "end": hang up. text = the goodbye.',
  "Every step except end, transfer and branch has `next` (the id of the following step).",
  "The first step is where the call starts (usually a greeting). Use {{variable}} to repeat",
  "saved answers. Keep it short: 5-15 steps. Use null for fields a step doesn't use.",
].join("\n");

export interface GeneratedAgent {
  name: string;
  flow: AgentFlow;
  prompt: PromptSettings;
  /** Problems validateFlow still finds after the repair round (empty when it's ready). */
  issues: FlowIssue[];
  llm: LlmCallInfo[];
}

export async function generateAgent(
  llm: LanguageModelProvider,
  description: string,
): Promise<GeneratedAgent> {
  const calls: LlmCallInfo[] = [];
  const ask = async (messages: Parameters<LanguageModelProvider["complete"]>[0]) => {
    const result = await llm.complete(messages, {
      temperature: 0.2,
      jsonSchema: OUTLINE_JSON_SCHEMA,
    });
    calls.push(llmCallInfo(result));
    const parsed = OutlineSchema.safeParse(safeJson(result.text));
    if (!parsed.success) throw new Error("The model's flow couldn't be read.");
    return { outline: parsed.data, raw: result.text };
  };

  const messages = [
    { role: "system" as const, content: INSTRUCTIONS },
    { role: "user" as const, content: description },
  ];
  const first = await ask(messages);
  let outline = first.outline;
  let flow = outlineToFlow(outline);
  let issues = validateFlow(flow);
  if (issues.length) {
    // One repair round: the model sees its own outline and what's wrong with it.
    ({ outline } = await ask([
      ...messages,
      { role: "assistant", content: first.raw },
      {
        role: "user",
        content: `That flow has problems:\n${issues.map((i) => `- ${i.message}`).join("\n")}\nFix them and send the whole flow again.`,
      },
    ]));
    flow = outlineToFlow(outline);
    issues = validateFlow(flow);
  }
  return {
    name: outline.name.trim() || "New agent",
    flow,
    prompt: {
      ...DEFAULT_PROMPT_SETTINGS,
      businessName: outline.businessName.trim() || DEFAULT_PROMPT_SETTINGS.businessName,
      role: outline.role.trim() || DEFAULT_PROMPT_SETTINGS.role,
    },
    issues,
    llm: calls,
  };
}

/** Builds nodes and edges from the outline, laid out top to bottom by distance from the start. */
export function outlineToFlow(raw: Outline): AgentFlow {
  // Prefixed ids: models like to call the first step "start", which is the Start node's id.
  const id = (stepId: string) => `s-${stepId}`;
  const outline = {
    ...raw,
    steps: raw.steps.map((s) => ({
      ...s,
      id: id(s.id),
      next: s.next ? id(s.next) : null,
      paths: s.paths?.map((p) => ({ ...p, next: id(p.next) })) ?? null,
    })),
  };
  const ids = new Set(outline.steps.map((s) => s.id));
  const nodes: unknown[] = [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }];
  const edges: { id: string; source: string; target: string; sourceHandle?: string }[] = [];
  const edge = (source: string, target: string, sourceHandle?: string) => {
    if (ids.has(target)) {
      edges.push({
        id: `e-${edges.length + 1}`,
        source,
        target,
        ...(sourceHandle ? { sourceHandle } : {}),
      });
    }
  };
  if (outline.steps[0]) edge("start", outline.steps[0].id);

  for (const step of outline.steps) {
    const text = step.text ?? "";
    const data = (() => {
      switch (step.type) {
        case "say":
          return { text };
        case "ask":
          return {
            question: text,
            variable: (step.variable ?? "answer").replace(/[^a-zA-Z0-9_]/g, "_"),
            answerType: step.answerType ?? "text",
          };
        case "aiResponse":
          return { instructions: text, tools: [] };
        case "knowledgeLookup":
          return { query: text };
        case "transfer":
          return { phoneNumber: step.phoneNumber ?? "", message: text };
        case "end":
          return { message: text };
        case "branch": {
          const paths = (step.paths ?? []).filter((p) => !/^otherwise$/i.test(p.label.trim()));
          return {
            conditions: paths.map((p, i) => ({
              id: `c-${i + 1}`,
              label: p.label,
              keywords: "",
              variable: "",
              equals: "",
            })),
          };
        }
      }
    })();
    nodes.push({ id: step.id, type: step.type, position: { x: 0, y: 0 }, data });
    if (step.type === "branch") {
      let i = 0;
      for (const path of step.paths ?? []) {
        const otherwise = /^otherwise$/i.test(path.label.trim());
        edge(step.id, path.next, otherwise ? BRANCH_ELSE_HANDLE : `c-${++i}`);
      }
    } else if (step.next) {
      edge(step.id, step.next);
    }
  }

  // Layout: rows by distance from the start, columns in the order steps are reached.
  const depth = new Map<string, number>([["start", 0]]);
  const queue = ["start"];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges.filter((e) => e.source === id)) {
      if (!depth.has(e.target)) {
        depth.set(e.target, depth.get(id)! + 1);
        queue.push(e.target);
      }
    }
  }
  const perRow = new Map<number, number>();
  for (const node of nodes as { id: string; position: { x: number; y: number } }[]) {
    const row = depth.get(node.id) ?? perRow.size + 1;
    const column = perRow.get(row) ?? 0;
    perRow.set(row, column + 1);
    node.position = { x: column * 300, y: row * 150 };
  }
  return AgentFlowSchema.parse({ nodes, edges });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

import type {
  CompletionOptions,
  CompletionResult,
  LanguageModelProvider,
} from "@voice-agent/pipeline";
import { FlowNodeSchema, type ConversationEvent, type FlowNode } from "@voice-agent/shared";
import type { Tool } from "@voice-agent/tools";
import { describe, expect, it } from "vitest";
import { buildContext, DEFAULT_CONTEXT_BUDGET } from "./context";
import { announcesAction, replyWithTools, runToolStep, type ToolTurn } from "./tool-runner";

const calls: Record<string, unknown>[] = [];
const checkAvailability: Tool = {
  name: "checkAvailability",
  description: "Free times on a date",
  source: "builtin",
  parameters: {
    type: "object",
    required: ["date"],
    properties: { date: { type: "string" }, people: { type: "integer" } },
  },
  async execute(args) {
    calls.push(args);
    return { ok: true, data: { date: args.date, freeTimes: ["10:00", "14:00"], open: true } };
  },
};

function newTurn(): ToolTurn {
  calls.length = 0;
  const turn: ToolTurn = {
    tools: new Map([[checkAvailability.name, checkAvailability]]),
    now: new Date(2026, 9, 18),
    callerPhone: null,
    variables: {},
    transcript: [{ role: "caller", text: "Is Friday free for two people?" }],
    events: [],
    context: () => buildContext(turn.transcript, null, DEFAULT_CONTEXT_BUDGET),
  };
  return turn;
}

function toolNode(data: object): Extract<FlowNode, { type: "tool" }> {
  return FlowNodeSchema.parse({ id: "t", type: "tool", position: { x: 0, y: 0 }, data }) as Extract<
    FlowNode,
    { type: "tool" }
  >;
}

/** A fake model that replies from a script; each reply may contain tool calls. */
function scripted(replies: Partial<CompletionResult>[]) {
  const options: (CompletionOptions | undefined)[] = [];
  const llm: LanguageModelProvider = {
    name: "fake",
    model: "fake-1",
    async complete(_messages, opts) {
      options.push(opts);
      const reply = replies.shift() ?? { text: "out of script" };
      return {
        text: "",
        model: "fake-1",
        latencyMs: 10,
        usage: { inputTokens: 100, outputTokens: 5, cachedInputTokens: 0 },
        costUsd: 0.001,
        ...reply,
      };
    },
  };
  return { llm, options };
}

const toolCall = (events: ConversationEvent[]) => events.filter((e) => e.type === "toolCall");

describe("runToolStep", () => {
  it("fills arguments from templates, lets the AI fill the missing ones, and saves the result", async () => {
    const turn = newTurn();
    const { llm, options } = scripted([
      {
        toolCalls: [
          { id: "c1", name: "checkAvailability", arguments: '{"date":"2026-10-23","people":2}' },
        ],
      },
    ]);
    const node = toolNode({
      toolName: "checkAvailability",
      arguments: { people: "{{party_size}}" },
      saveAs: "slots",
    });
    await runToolStep(turn, node, { party_size: "2" }, llm);

    expect(options[0]).toMatchObject({ toolChoice: { name: "checkAvailability" } });
    expect(calls[0]).toEqual({ date: "2026-10-23", people: 2 }); // "2" from the template became a number
    expect(toolCall(turn.events)[0]).toMatchObject({ ok: true, by: "step", filledByAi: ["date"] });
    expect(turn.variables).toEqual({
      slots_ok: "true",
      slots_error: "",
      slots_date: "2026-10-23",
      slots_freeTimes: "10:00, 14:00",
      slots_open: "true",
    });
    expect(turn.transcript.at(-1)?.text).toContain('"freeTimes":["10:00","14:00"]');
  });

  it("fails politely when an argument is missing and there is no AI, or the tool doesn't exist", async () => {
    const turn = newTurn();
    await runToolStep(turn, toolNode({ toolName: "checkAvailability" }), {}, null);
    await runToolStep(turn, toolNode({ toolName: "doesNotExist" }), {}, null);
    expect(toolCall(turn.events).map((e) => e.type === "toolCall" && e.error)).toEqual([
      "Missing argument(s): date",
      'The tool "doesNotExist" isn\'t available.',
    ]);
    expect(calls).toHaveLength(0);
    expect(turn.transcript.at(-1)?.text).toContain("Don't guess what it would have returned.");
  });
});

describe("replyWithTools (agentic loop)", () => {
  it("lets the model call a tool, read the result, then answer; costs are summed", async () => {
    const turn = newTurn();
    const { llm } = scripted([
      {
        text: "",
        toolCalls: [{ id: "c1", name: "checkAvailability", arguments: '{"date":"2026-10-23"}' }],
      },
      { text: "Friday has 10am or 2pm free. Which suits you?" },
    ]);
    const messages = [{ role: "system" as const, content: "sys" }];
    const reply = await replyWithTools(turn, "ai", llm, messages, [checkAvailability]);

    expect(reply.text).toBe("Friday has 10am or 2pm free. Which suits you?");
    expect(reply.llm).toMatchObject({ latencyMs: 20, inputTokens: 200, costUsd: 0.002 });
    expect(toolCall(turn.events)[0]).toMatchObject({
      by: "ai",
      ok: true,
      arguments: { date: "2026-10-23" },
    });
    // The model saw its own tool call and the result.
    expect(messages.map((m) => m.role)).toEqual(["system", "assistant", "tool"]);
  });

  it("makes a model that only announces an action actually act", async () => {
    const turn = newTurn();
    const { llm, options } = scripted([
      { text: "Let me check that for you, one moment please." },
      {
        toolCalls: [{ id: "c1", name: "checkAvailability", arguments: '{"date":"2026-10-23"}' }],
      },
      { text: "Friday has 10am or 2pm free." },
    ]);
    const reply = await replyWithTools(turn, "ai", llm, [], [checkAvailability]);
    expect(reply.text).toBe("Friday has 10am or 2pm free.");
    expect(toolCall(turn.events)).toHaveLength(1);
    // The second try had to call a tool.
    expect(options[1]?.toolChoice).toBe("required");
    expect(turn.events.find((e) => e.type === "note")).toBeTruthy();
  });

  it("tells announcements from ordinary replies", () => {
    expect(announcesAction("I'll book that for you now.")).toBe(true);
    expect(announcesAction("One moment, please.")).toBe(true);
    expect(announcesAction("I'm checking the prices.")).toBe(true);
    expect(announcesAction("Your ride is booked. Let me know if you need anything else.")).toBe(
      false,
    );
    expect(announcesAction("Which vehicle would you like?")).toBe(false);
  });

  it("refuses tools that aren't allowed in the step", async () => {
    const turn = newTurn();
    const { llm } = scripted([
      { toolCalls: [{ id: "c1", name: "deleteEverything", arguments: "{}" }] },
      { text: "Sorry, I can't do that." },
    ]);
    const reply = await replyWithTools(turn, "ai", llm, [], [checkAvailability]);
    expect(toolCall(turn.events)[0]).toMatchObject({
      ok: false,
      error: 'The tool "deleteEverything" isn\'t allowed in this step.',
    });
    expect(reply.text).toBe("Sorry, I can't do that.");
  });

  it("stops offering tools after 4 rounds, so the model has to answer", async () => {
    const turn = newTurn();
    const loop = {
      toolCalls: [{ id: "c", name: "checkAvailability", arguments: '{"date":"2026-10-23"}' }],
    };
    const { llm, options } = scripted([loop, loop, loop, loop, { text: "Here is what I found." }]);
    const reply = await replyWithTools(turn, "ai", llm, [], [checkAvailability]);
    expect(reply.text).toBe("Here is what I found.");
    expect(options.map((o) => Boolean(o?.tools))).toEqual([true, true, true, true, false]);
  });
});

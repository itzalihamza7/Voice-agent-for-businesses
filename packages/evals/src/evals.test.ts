import type { CompletionResult, LanguageModelProvider } from "@voice-agent/pipeline";
import type {
  ConversationState,
  EvalCase,
  EvalRun,
  TurnResult,
  ConversationAction,
} from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { checkScript, findPhrase } from "./checks";
import { goLiveDecision } from "./gate";
import { DEFAULT_CRITERIA, judgeConversation } from "./judge";
import { evaluateRetrieval } from "./retrieval";
import { runEvalCase, scoreCase, scoreRun, type AgentTurn } from "./run-case";

function scripted(answers: string[]): LanguageModelProvider {
  return {
    name: "fake",
    model: "fake",
    async complete(): Promise<CompletionResult> {
      const text = answers.shift();
      if (text === undefined) throw new Error("ran out of answers");
      return { text, model: "fake", latencyMs: 1, usage: null, costUsd: 0 };
    },
  };
}

const state = (patch: Partial<ConversationState>): ConversationState => ({
  nodeId: "listen",
  waitingFor: "callerMessage",
  variables: {},
  transcript: [],
  retries: 0,
  summary: null,
  callerPhone: null,
  callerMemory: [],
  ...patch,
});

/** A pretend agent: answers prices, says goodbye on "bye". */
const salonAgent: AgentTurn = async (current, action: ConversationAction): Promise<TurnResult> => {
  if (action.type === "start") {
    return {
      state: state({ transcript: [{ role: "agent", text: "Hi, how can I help?" }] }),
      events: [{ type: "say", nodeId: "greet", text: "Hi, how can I help?" }],
    };
  }
  const said = action.type === "reply" ? action.text : "";
  const transcript = [...current!.transcript, { role: "caller" as const, text: said }];
  if (/bye/i.test(said)) {
    transcript.push({ role: "agent", text: "Goodbye!" });
    return {
      state: state({ nodeId: null, waitingFor: null, transcript }),
      events: [{ type: "end", nodeId: "goodbye", message: "Goodbye!" }],
    };
  }
  transcript.push({ role: "agent", text: "A haircut is thirty pounds." });
  return {
    state: state({ transcript }),
    events: [
      {
        type: "aiResponse",
        nodeId: "answer",
        instructions: "",
        text: "A haircut is thirty pounds.",
      },
    ],
  };
};

const judgeAllGood = () =>
  JSON.stringify({
    scores: DEFAULT_CRITERIA.map((_, i) => ({ criterion: i + 1, reason: "fine", score: 2 })),
  });

describe("script checks", () => {
  it("matches any of the alternatives, ignoring case", () => {
    expect(findPhrase("It's Thirty pounds", "£30|thirty")).toBe("thirty");
    expect(findPhrase("It's free", "£30|thirty")).toBeNull();
  });

  it("checks the ending, phrases, answers and steps", () => {
    const final = state({
      nodeId: null,
      waitingFor: null,
      variables: { caller_name: "Ali" },
      transcript: [{ role: "agent", text: "We don't do nails, sorry. Goodbye!" }],
    });
    const checks = checkScript(
      {
        endsWith: "end",
        variables: { caller_name: "ali", phone: "123" },
        mustSay: ["don't do nails"],
        mustNotSay: ["we do nails"],
        visits: ["goodbye", "transfer"],
      },
      final,
      [{ type: "end", nodeId: "goodbye", message: "Goodbye!" }],
    );
    expect(checks.map((c) => [c.name, c.passed])).toEqual([
      ["Call ends", true],
      ['Saved caller_name = "ali"', true],
      ['Saved phone = "123"', false],
      ['Says "don\'t do nails"', true],
      ['Never says "we do nails"', true],
      ['Goes through step "goodbye"', true],
      ['Goes through step "transfer"', false],
    ]);
  });
});

describe("scoring", () => {
  it("averages checks and judge points; a 0 from the judge fails the case", () => {
    const checks = [
      { name: "a", passed: true, detail: "" },
      { name: "b", passed: false, detail: "" },
    ];
    expect(scoreCase(checks, null)).toEqual({ score: 0.5, passed: false });
    const judge = [
      { criterion: "x", reason: "", score: 2 as const },
      { criterion: "y", reason: "", score: 0 as const },
    ];
    expect(scoreCase([], judge)).toEqual({ score: 0.5, passed: false });
    expect(scoreCase([], null, "broke")).toEqual({ score: 0, passed: false });
  });
});

describe("runEvalCase", () => {
  const context = { businessName: "High Street Hair", rules: "" };

  it("plays a script case and checks it", async () => {
    const evalCase: EvalCase = {
      id: "c1",
      agentId: "demo",
      name: "Price, then goodbye",
      createdAt: "",
      criteria: [],
      definition: {
        kind: "script",
        turns: ["How much is a haircut?", "Thanks, bye", "Are you still there?"],
        expect: {
          endsWith: "end",
          variables: {},
          mustSay: ["£30|thirty"],
          mustNotSay: [],
          visits: [],
        },
      },
    };
    const result = await runEvalCase(
      evalCase,
      salonAgent,
      { caller: scripted([]), judge: scripted([judgeAllGood()]) },
      context,
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    // The call ended, so the third line was never said.
    expect(result.transcript.filter((e) => e.role === "caller")).toHaveLength(2);
    expect(result.judge).toHaveLength(DEFAULT_CRITERIA.length);
  });

  it("lets a model play the caller until it's done", async () => {
    const evalCase: EvalCase = {
      id: "c2",
      agentId: "demo",
      name: "Simulated",
      createdAt: "",
      criteria: ["Never promises a discount."],
      definition: { kind: "simulated", persona: "Sam", goal: "Find the price", maxTurns: 5 },
    };
    const caller = scripted([
      '{"say":"How much is a haircut?","done":false}',
      '{"say":"Great, bye!","done":true}',
    ]);
    const judge = scripted([
      JSON.stringify({
        scores: [...DEFAULT_CRITERIA, "x"].map((_, i) => ({
          criterion: i + 1,
          reason: "ok",
          score: i === 4 ? 1 : 2,
        })),
      }),
    ]);
    const result = await runEvalCase(evalCase, salonAgent, { caller, judge }, context);
    expect(result.transcript.map((e) => e.text)).toEqual([
      "Hi, how can I help?",
      "How much is a haircut?",
      "A haircut is thirty pounds.",
      "Great, bye!",
      "Goodbye!",
    ]);
    expect(result.judge?.at(-1)).toEqual({
      criterion: "Never promises a discount.",
      reason: "ok",
      score: 1,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.9);
  });

  it("fails a judge answer that skips a criterion", async () => {
    await expect(
      judgeConversation(scripted(['{"scores":[{"criterion":1,"reason":"ok","score":2}]}']), {
        businessName: "x",
        rules: "",
        goal: null,
        criteria: [],
        transcript: [{ role: "agent", text: "Hi" }],
      }),
    ).rejects.toThrow("skipped criterion 2");
  });
});

describe("goLiveDecision", () => {
  const run = (
    version: number,
    score: number | null,
    status: EvalRun["status"] = "done",
  ): EvalRun => ({
    id: `r${version}`,
    agentId: "demo",
    agentVersion: version,
    models: { agent: { provider: "openai" }, caller: { provider: "openai" }, judge: null },
    status,
    score,
    caseIds: [],
    results: [],
    createdAt: "",
  });

  it("needs a finished run, and blocks a drop beyond the tolerance", () => {
    expect(goLiveDecision(4, null, run(3, 90)).allowed).toBe(false);
    expect(goLiveDecision(4, run(4, null, "running"), run(3, 90)).allowed).toBe(false);
    expect(goLiveDecision(4, run(4, 80), run(3, 90))).toMatchObject({ allowed: false });
    expect(goLiveDecision(4, run(4, 88), run(3, 90)).allowed).toBe(true);
    expect(goLiveDecision(4, run(4, 50), null).allowed).toBe(true);
    expect(scoreRun([])).toBe(0);
  });
});

describe("evaluateRetrieval", () => {
  it("computes recall@1, recall@3 and MRR", async () => {
    const hit = (heading: string) => ({
      chunkId: heading,
      documentId: "d",
      documentTitle: "FAQ",
      heading,
      content: "",
      score: 1,
    });
    const store = {
      keywordSearch: async (query: string) =>
        query.includes("car") ? [hit("Prices"), hit("Parking")] : [hit("Prices")],
      vectorSearch: async () => [],
    };
    const report = await evaluateRetrieval(
      store,
      [
        { question: "price?", expected: "prices" },
        { question: "where do I put my car", expected: "parking" },
        { question: "sundays?", expected: "opening hours" },
      ],
      { mode: "keyword", embedding: null },
    );
    expect(report).toMatchObject({ recallAt1: 0.33, recallAt3: 0.67, mrr: 0.5 });
    expect(report.misses).toEqual([{ question: "sundays?", got: ["Prices"] }]);
  });
});

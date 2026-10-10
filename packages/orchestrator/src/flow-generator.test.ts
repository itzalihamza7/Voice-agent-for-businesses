import { validateFlow } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { outlineToFlow } from "./flow-generator";

const step = (id: string, type: string, fields: Record<string, unknown> = {}) => ({
  id,
  type,
  text: null,
  variable: null,
  answerType: null,
  phoneNumber: null,
  next: null,
  paths: null,
  ...fields,
});

describe("outlineToFlow", () => {
  it("builds a valid, laid-out flow with Branch paths and Otherwise", () => {
    const flow = outlineToFlow({
      name: "Pizza line",
      businessName: "Luigi's",
      role: "You take pizza orders.",
      steps: [
        step("greet", "say", { text: "Luigi's, hi!", next: "intent" }),
        step("intent", "branch", {
          paths: [
            { label: "The caller wants to order", next: "ask-pizza" },
            { label: "Otherwise", next: "human" },
          ],
        }),
        step("ask-pizza", "ask", {
          text: "Which pizza?",
          variable: "pizza",
          answerType: "text",
          next: "bye",
        }),
        step("human", "transfer", { phoneNumber: "+441632960123", text: "One moment." }),
        step("bye", "end", { text: "Thanks, bye!" }),
      ] as never,
    });
    expect(validateFlow(flow)).toEqual([]);
    expect(flow.edges.map((e) => [e.source, e.sourceHandle ?? "", e.target])).toEqual([
      ["start", "", "s-greet"],
      ["s-greet", "", "s-intent"],
      ["s-intent", "c-1", "s-ask-pizza"],
      ["s-intent", "else", "s-human"],
      ["s-ask-pizza", "", "s-bye"],
    ]);
    const y = (id: string) => flow.nodes.find((n) => n.id === id)!.position.y;
    expect(y("start")).toBeLessThan(y("s-greet"));
    expect(y("s-ask-pizza")).toBe(y("s-human"));
  });
});

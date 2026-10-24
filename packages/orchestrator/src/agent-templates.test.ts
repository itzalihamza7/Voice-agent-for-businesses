import { AgentConfigDraftSchema, validateFlow } from "@voice-agent/shared";
import { describe, expect, it } from "vitest";
import { websiteAgentDraft } from "./agent-templates";

describe("websiteAgentDraft", () => {
  it("builds a valid booking agent when the ride API is connected", () => {
    const draft = websiteAgentDraft({
      businessName: "SignatureMile",
      kind: "chauffeur",
      transferNumber: "+34600000000",
      tools: [
        "rides_search_places",
        "rides_get_quote",
        "rides_create_booking",
        "rides_find_booking",
        "rides_cancel_booking",
      ],
    });
    expect(AgentConfigDraftSchema.parse(draft)).toBeTruthy();
    expect(validateFlow(draft.flow)).toEqual([]);
    const book = draft.flow.nodes.find((n) => n.id === "book");
    expect(book?.type === "aiResponse" && book.data.tools).toEqual([
      "rides_search_places",
      "rides_get_quote",
      "rides_create_booking",
    ]);
  });

  it("builds a questions-only agent without an API or a number to transfer to", () => {
    const draft = websiteAgentDraft({ businessName: "Shop", kind: "general", tools: [] });
    expect(validateFlow(draft.flow)).toEqual([]);
    expect(draft.flow.nodes.map((n) => n.type)).not.toContain("transfer");
  });
});

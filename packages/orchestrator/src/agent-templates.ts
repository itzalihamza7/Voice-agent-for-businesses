import {
  DEFAULT_PROMPT_SETTINGS,
  DEFAULT_AGENT_TOOLS,
  type AgentConfigDraft,
  type FlowEdge,
  type FlowNode,
} from "@voice-agent/shared";

// Ready-made agents for a business that connected its website: answers questions from the
// imported pages and, when its app's API is connected, does the work the website does (quotes,
// bookings, finding and cancelling them). Built so a business only has to type its address.

export interface WebsiteAgentOptions {
  businessName: string;
  /** Tool names from the business's connection, e.g. rides_get_quote. Empty: questions only. */
  tools: string[];
  /** Where "speak to a person" goes. Without one, the agent offers a call back instead. */
  transferNumber?: string | null;
  /** "chauffeur" for ride booking apps; "general" for anything else. */
  kind: "chauffeur" | "general";
}

const at = (x: number, y: number) => ({ position: { x, y } });

export function websiteAgentDraft(options: WebsiteAgentOptions): AgentConfigDraft {
  const { businessName, tools, transferNumber, kind } = options;
  const pick = (...suffixes: string[]) => tools.filter((t) => suffixes.some((s) => t.endsWith(s)));
  const bookingTools = pick("_search_places", "_list_vehicles", "_get_quote", "_create_booking");
  const manageTools = pick("_find_booking", "_cancel_booking");
  const canBook = kind === "chauffeur" && bookingTools.length > 0;
  const canManage = kind === "chauffeur" && manageTools.length > 0;

  const nodes: FlowNode[] = [
    { id: "start", type: "start", ...at(0, 0), data: {} },
    {
      id: "greet",
      type: "say",
      ...at(0, 130),
      data: {
        text: canBook
          ? "Hello, this is {{business_name}}. I can give you a price, book a ride, or help with a booking you already have. How can I help?"
          : "Hello, this is {{business_name}}. How can I help you today?",
      },
    },
  ];
  const conditions: {
    id: string;
    label: string;
    keywords: string;
    variable: string;
    equals: string;
  }[] = [];
  const edges: FlowEdge[] = [
    { id: "e-start", source: "start", target: "greet" },
    { id: "e-greet", source: "greet", target: "listen" },
  ];
  const branchTo = (id: string, label: string, keywords: string, target: string) => {
    conditions.push({ id, label, keywords, variable: "", equals: "" });
    edges.push({ id: `e-${id}`, source: "listen", sourceHandle: id, target });
  };

  if (canBook) {
    nodes.push({
      id: "book",
      type: "aiResponse",
      ...at(-560, 420),
      data: {
        tools: bookingTools,
        instructions: [
          "Help the caller book a ride or get a price, one question at a time.",
          "You need: pickup, drop-off (not for hourly rides), date, time and number of passengers.",
          "Find each place with the place search and check the place's name with the caller.",
          "Get a quote and say the vehicles with their prices; never make up a price.",
          "When they choose and confirm, ask for their name, email and phone number, then book",
          "and read back the booking reference. Payment is to the chauffeur.",
        ].join(" "),
      },
    });
    edges.push({ id: "e-book", source: "book", target: "listen" });
    branchTo(
      "c-book",
      "The caller wants a price or to book a ride, or is giving booking details",
      "book, price, quote, ride, pick up",
      "book",
    );
  }
  if (canManage) {
    nodes.push({
      id: "manage",
      type: "aiResponse",
      ...at(-280, 420),
      data: {
        tools: manageTools,
        instructions:
          "Help with an existing booking. Ask for the booking reference and the email or phone number it was made with, then find it and tell the caller its details. Cancel only after the caller clearly confirms.",
      },
    });
    edges.push({ id: "e-manage", source: "manage", target: "listen" });
    branchTo(
      "c-manage",
      "The caller asks about an existing booking or wants to cancel",
      "cancel, my booking, reference",
      "manage",
    );
  }
  if (transferNumber) {
    nodes.push({
      id: "person",
      type: "transfer",
      ...at(280, 420),
      data: {
        phoneNumber: transferNumber,
        message: "Of course, I'll put you through to the team now.",
      },
    });
    branchTo("c-person", "The caller wants to speak to a person", "", "person");
  }
  branchTo(
    "c-done",
    "The caller has no more questions or says goodbye",
    "bye, goodbye, that's all",
    "bye",
  );
  nodes.push(
    {
      id: "listen",
      type: "branch",
      ...at(0, 280),
      data: { conditions },
    },
    {
      id: "lookup",
      type: "knowledgeLookup",
      ...at(0, 420),
      data: {
        query: `${businessName}: services, prices, vehicles, areas, policies and contact details`,
        limit: 3,
        mode: "hybrid",
        rewrite: true,
        rerank: true,
      },
    },
    {
      id: "answer",
      type: "aiResponse",
      ...at(0, 560),
      data: {
        tools: [],
        instructions:
          "Answer the caller's question directly with facts from the knowledge base results. If they don't contain the answer, say you're not sure and offer to have the team call back. Then ask if there's anything else you can help with.",
      },
    },
    {
      id: "bye",
      type: "end",
      ...at(560, 420),
      data: { message: "Thank you for calling {{business_name}}. Goodbye!" },
    },
  );
  edges.push(
    { id: "e-else", source: "listen", sourceHandle: "else", target: "lookup" },
    { id: "e-lookup", source: "lookup", target: "answer" },
    { id: "e-answer", source: "answer", target: "listen" },
  );

  return {
    schemaVersion: 1,
    name: `${businessName} phone agent`,
    providers: { stt: "mock", llm: "mock", tts: "mock" },
    flow: { nodes, edges },
    prompt: {
      ...DEFAULT_PROMPT_SETTINGS,
      businessName,
      role: "You are the phone receptionist for {{business_name}}.",
      persona: "Warm, discreet and efficient, like a concierge at a good hotel.",
      rules: [
        "Prices, availability and booking details come only from the tools; never guess them.",
        "Repeat dates, times, places and references back to the caller before acting on them.",
      ].join(" "),
    },
    tools: structuredClone(DEFAULT_AGENT_TOOLS),
  };
}

import { DEFAULT_PROMPT_SETTINGS, type AgentConfigDraft } from "@voice-agent/shared";

// The demo agent: answers callers' questions about High Street Hair (the example salon) from
// the knowledge base, in a loop until the caller is done. The knowledge base's example
// documents (packages/rag/src/examples.ts) are written for it.

const node = (x: number, y: number) => ({ position: { x, y } });

export const DEMO_AGENT_DRAFT: AgentConfigDraft = {
  schemaVersion: 1,
  name: "Demo support agent",
  providers: { stt: "mock", llm: "mock", tts: "mock" },
  flow: {
    nodes: [
      { id: "start", type: "start", ...node(0, 0), data: {} },
      {
        id: "greet",
        type: "say",
        ...node(0, 120),
        data: {
          text: "Hi, thanks for calling {{business_name}}! I can answer questions about our services, prices, opening hours and policies. What would you like to know?",
        },
      },
      {
        id: "listen",
        type: "branch",
        ...node(0, 260),
        data: {
          // Both paths are spelled out: with only "done", gpt-4.1-nano sometimes ended the call
          // on a new question ("Do you do nails?"). Otherwise also looks the question up.
          conditions: [
            {
              id: "c-question",
              label: "The caller asks a question or wants information",
              keywords: "",
              variable: "",
              equals: "",
            },
            {
              id: "c-done",
              label: "The caller has no more questions or wants to end the call",
              keywords: "bye, goodbye, that's all, nothing else, no thanks",
              variable: "",
              equals: "",
            },
          ],
        },
      },
      {
        id: "lookup",
        type: "knowledgeLookup",
        ...node(260, 400),
        data: {
          query: "Services, prices, opening hours, policies and the team at {{business_name}}",
          limit: 3,
          mode: "hybrid",
          rewrite: true,
          rerank: true,
        },
      },
      {
        id: "answer",
        type: "aiResponse",
        ...node(260, 540),
        data: {
          instructions:
            "Answer the caller's question using the knowledge base results. If they don't contain the answer, say you're not sure and offer to have a colleague call them back. Then ask if there's anything else you can help with.",
          tools: [],
        },
      },
      {
        id: "goodbye",
        type: "end",
        ...node(-260, 400),
        data: { message: "Thanks for calling {{business_name}}. Have a lovely day, goodbye!" },
      },
    ],
    edges: [
      { id: "e-start-greet", source: "start", target: "greet" },
      { id: "e-greet-listen", source: "greet", target: "listen" },
      { id: "e-listen-done", source: "listen", sourceHandle: "c-done", target: "goodbye" },
      { id: "e-listen-question", source: "listen", sourceHandle: "c-question", target: "lookup" },
      { id: "e-listen-else", source: "listen", sourceHandle: "else", target: "lookup" },
      { id: "e-lookup-answer", source: "lookup", target: "answer" },
      // Back to listening: one question after another until the caller is done.
      { id: "e-answer-listen", source: "answer", target: "listen" },
    ],
  },
  prompt: {
    ...DEFAULT_PROMPT_SETTINGS,
    businessName: "High Street Hair",
    rules:
      "This line answers questions only. If the caller wants to book, change or cancel an appointment, say the team will be happy to do that by phone or online, and give no times yourself.",
  },
  tools: { webhooks: [], mcpServers: [] },
};

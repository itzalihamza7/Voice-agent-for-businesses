import { z } from "zod";

// The versioned JSON document that describes one agent: its conversation flow
// (built in the drag-and-drop builder) and which vendor runs each pipeline step.
// Every config is validated with AgentConfigSchema before it is saved or used.
// Node types, node settings and A/B test fields will be added when the builder is built.

export const FlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});

export const FlowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

export const AgentFlowSchema = z.object({
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
});

// Names of the provider implementations to use, e.g. { stt: "mock" }.
// Changing a name here swaps the vendor without changing code.
export const ProviderSelectionSchema = z.object({
  stt: z.string().min(1),
  llm: z.string().min(1),
  tts: z.string().min(1),
});

export const AgentConfigSchema = z.object({
  // Version of this JSON format itself, so old configs can be migrated later.
  schemaVersion: z.literal(1),
  agentId: z.string().min(1),
  // Version of this agent's config: 1, 2, 3... Each save creates a new version.
  version: z.number().int().positive(),
  name: z.string().min(1),
  providers: ProviderSelectionSchema,
  flow: AgentFlowSchema,
});

export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type AgentFlow = z.infer<typeof AgentFlowSchema>;
export type ProviderSelection = z.infer<typeof ProviderSelectionSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

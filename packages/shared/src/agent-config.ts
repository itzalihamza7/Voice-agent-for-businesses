import { z } from "zod";
import { AgentFlowSchema } from "./flow";

// The versioned JSON document that describes one agent: its conversation flow
// (built in the drag-and-drop builder) and which vendor runs each pipeline step.
// Every config is validated with AgentConfigSchema when it is saved and when it is read.

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

// What a client sends to save a new version. The server adds agentId (from the URL) and version.
export const AgentConfigDraftSchema = AgentConfigSchema.omit({ agentId: true, version: true });

export const CreateAgentRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// One row in the agent list.
export interface AgentSummary {
  agentId: string;
  name: string;
  latestVersion: number;
  updatedAt: string;
}

export type ProviderSelection = z.infer<typeof ProviderSelectionSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentConfigDraft = z.infer<typeof AgentConfigDraftSchema>;
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

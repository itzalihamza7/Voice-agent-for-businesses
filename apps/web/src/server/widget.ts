import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { callCost } from "@voice-agent/orchestrator";
import {
  AgentConfigSchema,
  type AgentConfig,
  type TurnResult,
  type WidgetPublicConfig,
  type WidgetSettings,
  type WidgetSummary,
} from "@voice-agent/shared";
import { phoneModel } from "./phone";
import { getAgentConfigStore, getPrisma } from "./store";

// The website chat widget. The snippet's public id opens a chat with the agent's live version;
// each chat gets a token signed with APP_SECRET, so only the browser that started a chat can
// continue it. Visitors are anonymous: chats are rate limited per IP (in the proxy) and every
// widget has a daily AI cost cap.

/** Most messages one chat may have; a real conversation is far shorter. */
export const MAX_CHAT_MESSAGES = 60;

type WidgetRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getPrisma>["agentWidget"]["findUnique"]>>
>;

function summary(row: WidgetRow): WidgetSummary {
  return {
    publicId: row.publicId,
    enabled: row.enabled,
    allowedHosts: row.allowedHosts,
    color: row.color,
    title: row.title,
    dailyCostCapUsd: row.dailyCostCapUsd,
    whatsappNumber: row.whatsappNumber,
    phoneNumber: row.phoneNumber,
    liveChat: row.liveChat,
    alertWhatsapp: row.alertWhatsapp,
  };
}

/** The agent's widget settings, or null if it has none yet. */
export async function getWidget(businessId: string, agentId: string) {
  const row = await getPrisma().agentWidget.findFirst({ where: { agentId, businessId } });
  return row ? summary(row) : null;
}

export async function saveWidget(
  businessId: string,
  agentId: string,
  settings: WidgetSettings,
): Promise<WidgetSummary | null> {
  const prisma = getPrisma();
  const agent = await prisma.agent.findFirst({ where: { id: agentId, businessId } });
  if (!agent) return null;
  const row = await prisma.agentWidget.upsert({
    where: { agentId },
    create: {
      ...settings,
      agentId,
      businessId,
      publicId: `wg_${randomBytes(9).toString("base64url")}`,
    },
    update: settings,
  });
  return summary(row);
}

/** A widget that may chat now, with its business and agent. */
export async function activeWidget(publicId: string) {
  const row = await getPrisma().agentWidget.findUnique({
    where: { publicId },
    include: { business: { select: { name: true, suspendedAt: true } } },
  });
  if (!row || !row.enabled || row.business.suspendedAt) return null;
  return row;
}

/** What the chat window shows (public). */
export async function publicConfig(publicId: string): Promise<WidgetPublicConfig | null> {
  const row = await activeWidget(publicId);
  return row
    ? {
        title: row.title || row.business.name,
        color: row.color,
        whatsappNumber: row.whatsappNumber,
        phoneNumber: row.phoneNumber,
        liveChat: row.liveChat,
      }
    : null;
}

/** The hosts that may show the chat in a frame (for the CSP header), or null if none. */
export async function widgetHosts(publicId: string): Promise<string[] | null> {
  const row = await activeWidget(publicId);
  return row ? row.allowedHosts : null;
}

/** The version visitors get: the live one, or the latest when none is published. */
export async function widgetAgent(row: {
  agentId: string;
  businessId: string;
}): Promise<{ version: number; config: AgentConfig } | null> {
  const prisma = getPrisma();
  const agent = await prisma.agent.findUnique({
    where: { id: row.agentId },
    select: { liveVersion: true },
  });
  const store = await getAgentConfigStore(row.businessId);
  const config =
    (agent?.liveVersion ? await store.getVersion(row.agentId, agent.liveVersion) : null) ??
    (await store.getLatest(row.agentId));
  return config ? { version: config.version, config: AgentConfigSchema.parse(config) } : null;
}

/** The models widget chats use: the same fast model as phone calls. */
export const widgetModel = phoneModel;

// ----- Chat tokens ------------------------------------------------------------------------------

function sign(publicId: string, chatId: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) throw new Error("APP_SECRET must be set (16+ characters).");
  return createHmac("sha256", secret).update(`widget:${publicId}:${chatId}`).digest("base64url");
}

export function chatToken(publicId: string, chatId: string): string {
  return sign(publicId, chatId);
}

export function tokenValid(publicId: string, chatId: string, token: string): boolean {
  const expected = Buffer.from(sign(publicId, chatId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ----- Usage and the cost cap -------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

/** True while today's AI cost is under the widget's cap. */
export async function underCostCap(row: { agentId: string; dailyCostCapUsd: number }) {
  const usage = await getPrisma().widgetUsage.findUnique({
    where: { agentId_day: { agentId: row.agentId, day: today() } },
  });
  return (usage?.costUsd ?? 0) < row.dailyCostCapUsd;
}

/** Counts a turn: a new chat or a message, and what its AI cost. */
export async function countUsage(agentId: string, result: TurnResult, newChat: boolean) {
  const cost = callCost(result.events.map((event) => ({ atMs: 0, event }))) ?? 0;
  await getPrisma().widgetUsage.upsert({
    where: { agentId_day: { agentId, day: today() } },
    create: {
      agentId,
      day: today(),
      chats: newChat ? 1 : 0,
      messages: newChat ? 0 : 1,
      costUsd: cost,
    },
    update: {
      chats: { increment: newChat ? 1 : 0 },
      messages: { increment: newChat ? 0 : 1 },
      costUsd: { increment: cost },
    },
  });
}

/** Today's usage, for the builder. */
export async function usageToday(businessId: string, agentId: string) {
  const usage = await getPrisma().widgetUsage.findFirst({
    where: { agentId, day: today(), widget: { businessId } },
  });
  return { chats: usage?.chats ?? 0, messages: usage?.messages ?? 0, costUsd: usage?.costUsd ?? 0 };
}

import { timingSafeEqual } from "node:crypto";
import { AgentConfigSchema, type AgentConfig, type ModelSpec } from "@voice-agent/shared";
import { getPrisma } from "./store";

// Phone calls: which agent answers a number, and the check that a request comes from our voice
// gateway (shared secret), since these routes run calls without a signed-in user.

/** The live version (or the latest) of the agent that answers this number, with its business. */
export async function agentForNumber(
  phoneNumber: string,
): Promise<{ businessId: string; config: AgentConfig } | null> {
  const agent = await getPrisma().agent.findUnique({
    where: { phoneNumber },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!agent) return null;
  const row =
    agent.versions.find((v) => v.version === agent.liveVersion) ?? agent.versions[0] ?? null;
  return row ? { businessId: agent.businessId, config: AgentConfigSchema.parse(row.config) } : null;
}

/** The models phone calls use (PHONE_MODEL, e.g. "openai/gpt-4.1-nano"). */
export function phoneModel(): ModelSpec {
  const [provider, ...model] = (process.env.PHONE_MODEL ?? "openai/gpt-4.1-nano").split("/");
  return { provider: provider!, ...(model.length ? { model: model.join("/") } : {}) };
}

/** True if the request carries the gateway's secret. */
export function fromGateway(request: Request): boolean {
  const secret = process.env.GATEWAY_SECRET;
  const sent = request.headers.get("x-gateway-secret");
  if (!secret || !sent || sent.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(sent), Buffer.from(secret));
}

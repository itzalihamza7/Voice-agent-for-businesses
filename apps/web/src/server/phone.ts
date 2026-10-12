import { timingSafeEqual } from "node:crypto";
import { versionForCall } from "@voice-agent/agent-config";
import { AgentConfigSchema, type AgentConfig, type ModelSpec } from "@voice-agent/shared";
import { getPrisma } from "./store";

// Phone calls: which agent answers a number, and the check that a request comes from our voice
// gateway (shared secret), since these routes run calls without a signed-in user.

/**
 * The agent that answers this number, in the version this call gets: the live version (or the
 * latest), or the A/B candidate for its share of calls. With a version, that exact version
 * (later turns of a call keep the version it started with).
 */
export async function agentForNumber(
  phoneNumber: string,
  call: { callId: string } | { version: number },
): Promise<{ businessId: string; config: AgentConfig } | null> {
  const agent = await getPrisma().agent.findUnique({
    where: { phoneNumber },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!agent || agent.versions.length === 0) return null;
  const live = agent.liveVersion ?? agent.versions[0]!.version;
  const version =
    "version" in call
      ? call.version
      : versionForCall(
          call.callId,
          live,
          agent.abVersion !== null
            ? { version: agent.abVersion, percent: agent.abPercent ?? 0 }
            : null,
        ).version;
  const row = agent.versions.find((v) => v.version === version);
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

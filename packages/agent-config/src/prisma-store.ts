import { Prisma, type PrismaClient } from "@voice-agent/db";
import { AgentConfigSchema, type AgentConfig, type AgentSummary } from "@voice-agent/shared";
import type { AgentConfigStore } from "./store";

// PostgreSQL store. One instance serves one business: every query is filtered by
// businessId, so a business can never read or overwrite another business's agents.

const MAX_SAVE_ATTEMPTS = 3;

export class PrismaAgentConfigStore implements AgentConfigStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly businessId: string,
  ) {}

  async saveNewVersion(draft: Omit<AgentConfig, "version">): Promise<AgentConfig> {
    // Saves to an existing agent are serialized by a row lock (see saveOnce). Two saves that
    // create the same *new* agent at once can still collide on the primary key: the loser
    // retries, and by then the row exists and the lock applies.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.saveOnce(draft);
      } catch (error) {
        if (attempt < MAX_SAVE_ATTEMPTS && isUniqueViolation(error)) continue;
        throw error;
      }
    }
  }

  async getLatest(agentId: string): Promise<AgentConfig | null> {
    const row = await this.prisma.agentConfigVersion.findFirst({
      where: { agentId, agent: { businessId: this.businessId } },
      orderBy: { version: "desc" },
    });
    return row ? AgentConfigSchema.parse(row.config) : null;
  }

  async getVersion(agentId: string, version: number): Promise<AgentConfig | null> {
    const row = await this.prisma.agentConfigVersion.findFirst({
      where: { agentId, version, agent: { businessId: this.businessId } },
    });
    return row ? AgentConfigSchema.parse(row.config) : null;
  }

  async listVersions(agentId: string): Promise<AgentConfig[]> {
    const rows = await this.prisma.agentConfigVersion.findMany({
      where: { agentId, agent: { businessId: this.businessId } },
      orderBy: { version: "asc" },
    });
    return rows.map((row) => AgentConfigSchema.parse(row.config));
  }

  async listAgents(): Promise<AgentSummary[]> {
    const agents = await this.prisma.agent.findMany({
      where: { businessId: this.businessId },
      orderBy: { updatedAt: "desc" },
      include: { versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } },
    });
    return agents.flatMap((agent) => {
      const latest = agent.versions[0];
      return latest
        ? [
            {
              agentId: agent.id,
              name: agent.name,
              latestVersion: latest.version,
              updatedAt: agent.updatedAt.toISOString(),
            },
          ]
        : [];
    });
  }

  private async saveOnce(draft: Omit<AgentConfig, "version">): Promise<AgentConfig> {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE locks the agent row until this transaction ends, so concurrent saves
      // for the same agent run one after another and each one sees the real latest version.
      const [agent] = await tx.$queryRaw<{ businessId: string }[]>`
        SELECT business_id AS "businessId" FROM agents WHERE id = ${draft.agentId} FOR UPDATE`;
      if (agent && agent.businessId !== this.businessId) {
        // Same message as "not found" on purpose: don't reveal that the id exists elsewhere.
        throw new Error(`Agent "${draft.agentId}" not found`);
      }

      const latest = await tx.agentConfigVersion.findFirst({
        where: { agentId: draft.agentId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const config = AgentConfigSchema.parse({ ...draft, version: (latest?.version ?? 0) + 1 });

      if (agent) {
        await tx.agent.update({ where: { id: config.agentId }, data: { name: config.name } });
      } else {
        await tx.agent.create({
          data: { id: config.agentId, businessId: this.businessId, name: config.name },
        });
      }
      await tx.agentConfigVersion.create({
        // AgentConfig is plain JSON (validated above), so this cast is safe.
        data: {
          agentId: config.agentId,
          version: config.version,
          config: config as Prisma.InputJsonObject,
        },
      });
      return config;
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

import { AgentConfigSchema } from "@voice-agent/shared";
import { createPrismaClient } from "../src/client";
import type { Prisma } from "../src/generated/prisma/client";
import { DEFAULT_BUSINESS_ID } from "../src/constants";
import { DEMO_AGENT_DRAFT, DEMO_EVAL_CASES } from "./demo-agent";

// Creates the demo business and the "demo" agent (a Q&A agent, see demo-agent.ts). Safe to run
// many times: it only creates what is missing and never touches existing versions.

const DEMO_AGENT_ID = "demo";

async function main() {
  const prisma = createPrismaClient();
  try {
    await prisma.business.upsert({
      where: { id: DEFAULT_BUSINESS_ID },
      create: { id: DEFAULT_BUSINESS_ID, name: "Demo Business" },
      update: {},
    });

    const existing = await prisma.agent.findUnique({
      where: { id: DEMO_AGENT_ID },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (existing) {
      // Demo agents seeded before the Q&A flow existed have only a Start step: add the Q&A flow
      // as a new version. Anything else was built by someone, so it is left alone.
      await seedEvalCases(prisma);
      const latest = existing.versions[0];
      const stored = latest && AgentConfigSchema.safeParse(latest.config);
      if (latest && stored?.success && stored.data.flow.nodes.length <= 1) {
        const version = latest.version + 1;
        const config = demoConfig(version);
        await prisma.agent.update({
          where: { id: DEMO_AGENT_ID },
          data: {
            name: config.name,
            versions: { create: { version, config: config as Prisma.InputJsonObject } },
          },
        });
        console.log(`Seed: gave the demo agent its Q&A flow (version ${version}).`);
        return;
      }
      console.log("Seed: demo data already present.");
      return;
    }

    const config = demoConfig(1);
    await prisma.agent.create({
      data: {
        id: DEMO_AGENT_ID,
        businessId: DEFAULT_BUSINESS_ID,
        name: config.name,
        // AgentConfig is plain JSON (validated above), so this cast is safe.
        versions: { create: { version: 1, config: config as Prisma.InputJsonObject } },
      },
    });
    console.log('Seed: created demo business and agent "demo".');
    await seedEvalCases(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** The demo agent's eval cases, while it has neither cases nor runs (deleted ones stay deleted). */
async function seedEvalCases(prisma: ReturnType<typeof createPrismaClient>) {
  const where = { agentId: DEMO_AGENT_ID };
  if ((await prisma.evalCase.count({ where })) || (await prisma.evalRun.count({ where }))) return;
  await prisma.evalCase.createMany({
    data: DEMO_EVAL_CASES.map((c) => ({
      agentId: DEMO_AGENT_ID,
      name: c.name,
      definition: c.definition as Prisma.InputJsonObject,
      criteria: c.criteria,
    })),
  });
  console.log(`Seed: added ${DEMO_EVAL_CASES.length} eval cases to the demo agent.`);
}

function demoConfig(version: number) {
  return AgentConfigSchema.parse({ ...DEMO_AGENT_DRAFT, agentId: DEMO_AGENT_ID, version });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

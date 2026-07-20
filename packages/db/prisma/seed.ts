import { AgentConfigSchema } from "@voice-agent/shared";
import { createPrismaClient } from "../src/client";
import type { Prisma } from "../src/generated/prisma/client";
import { DEFAULT_BUSINESS_ID } from "../src/constants";

// Creates the demo business and a "demo" agent (version 1). Safe to run many times:
// it only creates what is missing and never touches existing versions.

const DEMO_AGENT_ID = "demo";

async function main() {
  const prisma = createPrismaClient();
  try {
    await prisma.business.upsert({
      where: { id: DEFAULT_BUSINESS_ID },
      create: { id: DEFAULT_BUSINESS_ID, name: "Demo Business" },
      update: {},
    });

    const existing = await prisma.agent.findUnique({ where: { id: DEMO_AGENT_ID } });
    if (existing) {
      console.log("Seed: demo data already present.");
      return;
    }

    const config = AgentConfigSchema.parse({
      schemaVersion: 1,
      agentId: DEMO_AGENT_ID,
      version: 1,
      name: "Demo support agent",
      providers: { stt: "mock", llm: "mock", tts: "mock" },
      flow: {
        nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      },
    });

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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

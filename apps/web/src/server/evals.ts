import { DEFAULT_BUSINESS_ID, type Prisma, type PrismaClient } from "@voice-agent/db";
import { runEvalCase, scoreRun } from "@voice-agent/evals";
import { AgentNotFoundError, runTurn } from "@voice-agent/orchestrator";
import { createLanguageModel } from "@voice-agent/pipeline";
import {
  EvalCaseDefinitionSchema,
  EvalModelsSchema,
  type EvalCase,
  type EvalCaseResult,
  type EvalModels,
  type EvalRun,
  type NewEvalCase,
} from "@voice-agent/shared";
import { z } from "zod";
import { knowledgeSearcher } from "./knowledge";
import { getAgentConfigStore, getPrisma } from "./store";
import { loadTools } from "./tools";

// Eval cases, eval runs and the live version, in Postgres. Every query checks that the agent
// belongs to the business (agents are the link to the business here).

export class PrismaEvalStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly businessId: string,
  ) {}

  private async agent(agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, businessId: this.businessId },
      select: { id: true, liveVersion: true },
    });
    if (!agent) throw new AgentNotFoundError(agentId);
    return agent;
  }

  async listCases(agentId: string): Promise<EvalCase[]> {
    await this.agent(agentId);
    const rows = await this.prisma.evalCase.findMany({
      where: { agentId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toCase);
  }

  async addCase(agentId: string, input: NewEvalCase): Promise<EvalCase> {
    await this.agent(agentId);
    const row = await this.prisma.evalCase.create({
      data: {
        agentId,
        name: input.name,
        definition: input.definition as Prisma.InputJsonObject,
        criteria: input.criteria,
      },
    });
    return toCase(row);
  }

  async deleteCase(agentId: string, caseId: string): Promise<boolean> {
    await this.agent(agentId);
    const { count } = await this.prisma.evalCase.deleteMany({ where: { id: caseId, agentId } });
    return count > 0;
  }

  async startRun(agentId: string, version: number, models: EvalModels): Promise<EvalRun> {
    const cases = await this.listCases(agentId);
    const row = await this.prisma.evalRun.create({
      data: {
        agentId,
        agentVersion: version,
        models: models as Prisma.InputJsonObject,
        status: cases.length ? "running" : "done",
        score: cases.length ? null : 0,
        caseIds: cases.map((c) => c.id),
        results: [],
      },
    });
    return toRun(row);
  }

  async getRun(agentId: string, runId: string): Promise<EvalRun | null> {
    await this.agent(agentId);
    const row = await this.prisma.evalRun.findFirst({ where: { id: runId, agentId } });
    return row && toRun(row);
  }

  async listRuns(agentId: string): Promise<EvalRun[]> {
    await this.agent(agentId);
    const rows = await this.prisma.evalRun.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(toRun);
  }

  /** Stores one case's result; the run is done (and scored) when every case has one. */
  async addResult(runId: string, result: EvalCaseResult): Promise<EvalRun> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.evalRun.findUniqueOrThrow({ where: { id: runId } });
      const run = toRun(row);
      const results = [...run.results.filter((r) => r.caseId !== result.caseId), result];
      const done = run.caseIds.every((id) => results.some((r) => r.caseId === id));
      const updated = await tx.evalRun.update({
        where: { id: runId },
        data: {
          results: results as unknown as Prisma.InputJsonArray,
          status: done ? "done" : "running",
          score: done ? scoreRun(results) : null,
        },
      });
      return toRun(updated);
    });
  }

  /** The latest finished run of a version. */
  async latestFinishedRun(agentId: string, version: number): Promise<EvalRun | null> {
    const row = await this.prisma.evalRun.findFirst({
      where: { agentId, agentVersion: version, status: "done" },
      orderBy: { createdAt: "desc" },
    });
    return row && toRun(row);
  }

  async liveVersion(agentId: string): Promise<number | null> {
    return (await this.agent(agentId)).liveVersion;
  }

  async setLiveVersion(agentId: string, version: number): Promise<void> {
    await this.agent(agentId);
    await this.prisma.agent.update({ where: { id: agentId }, data: { liveVersion: version } });
  }
}

const CriteriaSchema = z.array(z.string());

function toCase(row: {
  id: string;
  agentId: string;
  name: string;
  definition: Prisma.JsonValue;
  criteria: Prisma.JsonValue;
  createdAt: Date;
}): EvalCase {
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    definition: EvalCaseDefinitionSchema.parse(row.definition),
    criteria: CriteriaSchema.parse(row.criteria),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRun(row: {
  id: string;
  agentId: string;
  agentVersion: number;
  models: Prisma.JsonValue;
  status: string;
  score: number | null;
  caseIds: Prisma.JsonValue;
  results: Prisma.JsonValue;
  createdAt: Date;
}): EvalRun {
  return {
    id: row.id,
    agentId: row.agentId,
    agentVersion: row.agentVersion,
    models: EvalModelsSchema.parse(row.models),
    status: row.status === "done" ? "done" : "running",
    score: row.score,
    caseIds: z.array(z.string()).parse(row.caseIds),
    // Written by this store only, so it is trusted as is.
    results: row.results as unknown as EvalCaseResult[],
    createdAt: row.createdAt.toISOString(),
  };
}

// Every request uses the demo business until auth exists (roadmap phase 15).
export function getEvalStore(): PrismaEvalStore {
  return new PrismaEvalStore(getPrisma(), DEFAULT_BUSINESS_ID);
}

/** Runs one case against a saved version of the agent, with the run's models. */
export async function runCaseAgainstVersion(
  agentId: string,
  version: number,
  evalCase: EvalCase,
  models: EvalModels,
): Promise<EvalCaseResult> {
  const config = await getAgentConfigStore().getVersion(agentId, version);
  if (!config) throw new AgentNotFoundError(`${agentId} v${version}`);
  const agentModel = createLanguageModel(models.agent);
  const tools = await loadTools(config.tools);
  try {
    const deps = {
      decisions: agentModel,
      replies: agentModel,
      prompt: config.prompt,
      tools: tools.tools,
      knowledge: knowledgeSearcher(),
    };
    return await runEvalCase(
      evalCase,
      (state, action) => runTurn(config.flow, state, action, deps),
      {
        caller: createLanguageModel(models.caller),
        judge: models.judge ? createLanguageModel(models.judge) : null,
      },
      { businessName: config.prompt.businessName, rules: config.prompt.rules },
    );
  } finally {
    await tools.close();
  }
}

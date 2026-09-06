-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "live_version" INTEGER;

-- CreateTable
CREATE TABLE "eval_cases" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "criteria" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "agent_version" INTEGER NOT NULL,
    "models" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "case_ids" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eval_cases_agent_id_idx" ON "eval_cases"("agent_id");

-- CreateIndex
CREATE INDEX "eval_runs_agent_id_created_at_idx" ON "eval_runs"("agent_id", "created_at");

-- AddForeignKey
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


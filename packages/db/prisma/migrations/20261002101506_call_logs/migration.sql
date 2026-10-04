-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "caller_phone" TEXT,
ADD COLUMN     "cost_usd" DOUBLE PRECISION,
ADD COLUMN     "flags" JSONB,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'test',
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "thread_id" TEXT,
ADD COLUMN     "trace" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "calls_thread_id_key" ON "calls"("thread_id");


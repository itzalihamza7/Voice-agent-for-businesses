-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "ab_percent" INTEGER,
ADD COLUMN     "ab_version" INTEGER;

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version" INTEGER,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "releases_agent_id_created_at_idx" ON "releases"("agent_id", "created_at");

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


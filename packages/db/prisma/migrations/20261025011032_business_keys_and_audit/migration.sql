-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "data_key" TEXT,
ADD COLUMN     "retention_days" INTEGER;

-- AlterTable: existing connections get a token straight away (new ones get one from Prisma).
ALTER TABLE "connections" ADD COLUMN     "verification_token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN     "verified_at" TIMESTAMP(3);
ALTER TABLE "connections" ALTER COLUMN "verification_token" DROP DEFAULT;

-- CreateTable
CREATE TABLE "connection_requests" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "call_id" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connection_requests_connection_id_created_at_idx" ON "connection_requests"("connection_id", "created_at");

-- CreateIndex
CREATE INDEX "connection_requests_business_id_created_at_idx" ON "connection_requests"("business_id", "created_at");

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

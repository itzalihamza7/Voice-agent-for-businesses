-- CreateTable
CREATE TABLE "caller_memories" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caller_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caller_memories_business_id_phone_number_key" ON "caller_memories"("business_id", "phone_number");

-- AddForeignKey
ALTER TABLE "caller_memories" ADD CONSTRAINT "caller_memories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


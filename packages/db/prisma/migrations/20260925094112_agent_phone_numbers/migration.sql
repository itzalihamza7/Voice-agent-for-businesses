-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "phone_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agents_phone_number_key" ON "agents"("phone_number");


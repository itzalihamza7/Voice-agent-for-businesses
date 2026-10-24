-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "suspended_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

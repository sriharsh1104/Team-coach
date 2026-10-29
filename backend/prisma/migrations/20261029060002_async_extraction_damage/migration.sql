-- AlterTable
ALTER TABLE "StatExtraction" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
ALTER TABLE "StatExtraction" ADD COLUMN "failureReason" TEXT;

-- AlterTable
ALTER TABLE "PlayerStat" ADD COLUMN "damage" INTEGER NOT NULL DEFAULT 0;

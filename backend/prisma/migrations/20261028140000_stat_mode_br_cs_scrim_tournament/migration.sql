-- CreateEnum
CREATE TYPE "StatMode" AS ENUM ('BR', 'CS', 'SCRIM', 'TOURNAMENT');

-- AlterTable
ALTER TABLE "StatExtraction" ADD COLUMN "mode" "StatMode" NOT NULL DEFAULT 'BR';

-- AlterTable
ALTER TABLE "PlayerStat" ADD COLUMN "mode" "StatMode" NOT NULL DEFAULT 'BR';

-- CreateIndex
CREATE INDEX "StatExtraction_orgId_mode_status_idx" ON "StatExtraction"("orgId", "mode", "status");

-- CreateIndex
CREATE INDEX "PlayerStat_orgId_mode_idx" ON "PlayerStat"("orgId", "mode");

-- CreateIndex
CREATE INDEX "PlayerStat_userId_mode_idx" ON "PlayerStat"("userId", "mode");

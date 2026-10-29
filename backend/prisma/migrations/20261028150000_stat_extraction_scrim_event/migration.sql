-- AlterTable
ALTER TABLE "StatExtraction" ADD COLUMN "scrimEventId" TEXT;

-- CreateIndex
CREATE INDEX "StatExtraction_scrimEventId_idx" ON "StatExtraction"("scrimEventId");

-- AddForeignKey
ALTER TABLE "StatExtraction" ADD CONSTRAINT "StatExtraction_scrimEventId_fkey" FOREIGN KEY ("scrimEventId") REFERENCES "ScrimEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

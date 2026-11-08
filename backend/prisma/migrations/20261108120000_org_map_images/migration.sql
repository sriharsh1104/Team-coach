-- CreateTable
CREATE TABLE "OrgMapImage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMapImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgMapImage_orgId_mapId_idx" ON "OrgMapImage"("orgId", "mapId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMapImage_orgId_mapId_slot_key" ON "OrgMapImage"("orgId", "mapId", "slot");

-- AddForeignKey
ALTER TABLE "OrgMapImage" ADD CONSTRAINT "OrgMapImage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

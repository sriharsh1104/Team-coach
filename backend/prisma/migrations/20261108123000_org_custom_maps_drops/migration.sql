-- CreateTable
CREATE TABLE "OrgCustomMap" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "overviewFileKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgCustomMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMapDropPoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "catalogMapId" TEXT,
    "customMapId" TEXT,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'extra',
    "note" TEXT NOT NULL DEFAULT '',
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMapDropPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgCustomMap_orgId_idx" ON "OrgCustomMap"("orgId");

-- CreateIndex
CREATE INDEX "OrgMapDropPoint_orgId_catalogMapId_idx" ON "OrgMapDropPoint"("orgId", "catalogMapId");

-- CreateIndex
CREATE INDEX "OrgMapDropPoint_customMapId_idx" ON "OrgMapDropPoint"("customMapId");

-- AddForeignKey
ALTER TABLE "OrgCustomMap" ADD CONSTRAINT "OrgCustomMap_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMapDropPoint" ADD CONSTRAINT "OrgMapDropPoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMapDropPoint" ADD CONSTRAINT "OrgMapDropPoint_customMapId_fkey" FOREIGN KEY ("customMapId") REFERENCES "OrgCustomMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

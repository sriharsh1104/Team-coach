-- Guild achievements: grand-final tournament finishes (owner-written, guild-readable).
CREATE TABLE "OrgAchievement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "grandFinalLink" TEXT,
    "standing" TEXT NOT NULL,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAchievement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgAchievement_orgId_playedAt_idx" ON "OrgAchievement"("orgId", "playedAt");

ALTER TABLE "OrgAchievement" ADD CONSTRAINT "OrgAchievement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

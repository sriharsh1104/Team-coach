-- Achievements: points number → optional points-table screenshot.
ALTER TABLE "OrgAchievement" ADD COLUMN "pointsTableFileKey" TEXT;
ALTER TABLE "OrgAchievement" DROP COLUMN IF EXISTS "points";

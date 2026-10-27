-- AlterEnum
ALTER TYPE "MembershipRole" ADD VALUE 'ANALYST';

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the earliest membership in each org (i.e. whoever created it)
-- becomes that org's owner. Local/dev-only data per this project's scope —
-- safe to assume "earliest member" approximates "creator".
UPDATE "Membership" m
SET "isOwner" = true
WHERE m.id = (
  SELECT m2.id FROM "Membership" m2
  WHERE m2."orgId" = m."orgId"
  ORDER BY m2."createdAt" ASC, m2.id ASC
  LIMIT 1
);

-- AlterTable
ALTER TABLE "Org" ADD COLUMN "rosterCode" TEXT;
ALTER TABLE "Org" ADD COLUMN "rosterReferralToken" TEXT;

-- Backfill existing orgs with distinct codes (never equal to orgCode / referralToken).
UPDATE "Org"
SET
  "rosterCode" = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || id || 'roster-code') FROM 1 FOR 8)),
  "rosterReferralToken" = SUBSTRING(MD5(RANDOM()::TEXT || id || 'roster-token') FROM 1 FOR 24);

-- Extremely unlikely collisions with guild codes; regenerate any that clash.
UPDATE "Org" o
SET "rosterCode" = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || o.id || 'roster-code-2') FROM 1 FOR 8))
WHERE EXISTS (
  SELECT 1 FROM "Org" g WHERE g."orgCode" = o."rosterCode" AND g.id <> o.id
)
OR o."rosterCode" = o."orgCode";

UPDATE "Org" o
SET "rosterReferralToken" = SUBSTRING(MD5(RANDOM()::TEXT || o.id || 'roster-token-2') FROM 1 FOR 24)
WHERE EXISTS (
  SELECT 1 FROM "Org" g WHERE g."referralToken" = o."rosterReferralToken" AND g.id <> o.id
)
OR o."rosterReferralToken" = o."referralToken";

ALTER TABLE "Org" ALTER COLUMN "rosterCode" SET NOT NULL;
ALTER TABLE "Org" ALTER COLUMN "rosterReferralToken" SET NOT NULL;

CREATE UNIQUE INDEX "Org_rosterCode_key" ON "Org"("rosterCode");
CREATE UNIQUE INDEX "Org_rosterReferralToken_key" ON "Org"("rosterReferralToken");

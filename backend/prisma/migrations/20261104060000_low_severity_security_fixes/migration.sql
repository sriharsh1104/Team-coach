-- One roster seat per user, DB-enforced: replaces the composite
-- (userId, orgId) unique with a plain unique on userId, so two concurrent
-- join/create requests can't both slip past the application's
-- check-then-act "do you already have an org" check into two different orgs.
DROP INDEX "Membership_userId_orgId_key";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_key" UNIQUE ("userId");

-- Same reasoning for guild seats.
DROP INDEX "GuildMembership_userId_orgId_key";
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_userId_key" UNIQUE ("userId");

-- Tracks the last accepted TOTP time-step so the same 2FA code can't be
-- replayed more than once within its validity window.
ALTER TABLE "User" ADD COLUMN "lastTotpStep" INTEGER;

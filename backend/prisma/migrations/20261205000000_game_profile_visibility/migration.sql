-- AlterTable
ALTER TABLE "UserGameProfile" ADD COLUMN "showNameToMembers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserGameProfile" ADD COLUMN "showUidToMembers" BOOLEAN NOT NULL DEFAULT true;

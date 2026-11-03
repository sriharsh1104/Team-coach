-- CreateEnum
CREATE TYPE "GuildRole" AS ENUM ('MEMBER', 'ELDER', 'ACTIVE_LEADER', 'LEADER');

-- CreateTable
CREATE TABLE "GuildMembership" (
    "id" TEXT NOT NULL,
    "role" "GuildRole" NOT NULL DEFAULT 'MEMBER',
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildMembership_userId_orgId_key" ON "GuildMembership"("userId", "orgId");

-- CreateIndex
CREATE INDEX "GuildMembership_orgId_idx" ON "GuildMembership"("orgId");

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing roster members are already in the org's guild. Owners lead it.
INSERT INTO "GuildMembership" ("id", "role", "userId", "orgId", "createdAt")
SELECT
    md5(m."userId" || ':' || m."orgId"),
    CASE WHEN m."isOwner" THEN 'LEADER'::"GuildRole" ELSE 'MEMBER'::"GuildRole" END,
    m."userId",
    m."orgId",
    m."createdAt"
FROM "Membership" m;

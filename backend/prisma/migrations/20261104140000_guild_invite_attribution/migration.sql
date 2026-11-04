-- AlterTable
ALTER TABLE "GuildMembership" ADD COLUMN "invitedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "GuildMembership_invitedByUserId_idx" ON "GuildMembership"("invitedByUserId");

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

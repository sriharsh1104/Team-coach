-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "historyVisibleToNewMembers" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorBackupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

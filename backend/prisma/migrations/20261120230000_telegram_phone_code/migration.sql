-- AlterTable
ALTER TABLE "TelegramPhoneLink" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "codeHash" TEXT,
ADD COLUMN     "codeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

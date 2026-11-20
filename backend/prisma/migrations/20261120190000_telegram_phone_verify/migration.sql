-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TelegramPhoneLink" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramChatId" BIGINT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPhoneLink_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "TelegramPhoneLink_userId_idx" ON "TelegramPhoneLink"("userId");

-- CreateIndex
CREATE INDEX "TelegramPhoneLink_telegramChatId_idx" ON "TelegramPhoneLink"("telegramChatId");

-- AddForeignKey
ALTER TABLE "TelegramPhoneLink" ADD CONSTRAINT "TelegramPhoneLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

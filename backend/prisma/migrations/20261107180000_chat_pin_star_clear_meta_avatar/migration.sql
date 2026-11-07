-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarFileKey" TEXT;

-- CreateTable
CREATE TABLE "ChatPin" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatPin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatStar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatStar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatClear" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatClear_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatChannelMeta" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "description" VARCHAR(500),
    "avatarUrl" TEXT,
    "avatarFileKey" TEXT,
    "disappearAfterSec" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "ChatChannelMeta_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ChatPin_orgId_channelKey_messageId_key" ON "ChatPin"("orgId", "channelKey", "messageId");
CREATE INDEX "ChatPin_orgId_channelKey_idx" ON "ChatPin"("orgId", "channelKey");

CREATE UNIQUE INDEX "ChatStar_userId_messageId_key" ON "ChatStar"("userId", "messageId");
CREATE INDEX "ChatStar_userId_orgId_channelKey_idx" ON "ChatStar"("userId", "orgId", "channelKey");

CREATE UNIQUE INDEX "ChatClear_userId_orgId_channelKey_key" ON "ChatClear"("userId", "orgId", "channelKey");

CREATE UNIQUE INDEX "ChatChannelMeta_orgId_channelKey_key" ON "ChatChannelMeta"("orgId", "channelKey");

-- FKs
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatStar" ADD CONSTRAINT "ChatStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatStar" ADD CONSTRAINT "ChatStar_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatStar" ADD CONSTRAINT "ChatStar_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatClear" ADD CONSTRAINT "ChatClear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatClear" ADD CONSTRAINT "ChatClear_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatChannelMeta" ADD CONSTRAINT "ChatChannelMeta_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

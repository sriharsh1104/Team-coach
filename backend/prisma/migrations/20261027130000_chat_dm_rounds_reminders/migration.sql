-- CreateEnum
CREATE TYPE "ScrimRoundResult" AS ENUM ('PENDING', 'QUALIFIED', 'ELIMINATED');

-- AlterTable ScrimEvent
ALTER TABLE "ScrimEvent" ADD COLUMN "remind30" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ScrimEvent" ADD COLUMN "remind10" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable ScrimRound
CREATE TABLE "ScrimRound" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "result" "ScrimRoundResult" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrimRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrimRound_eventId_roundNumber_key" ON "ScrimRound"("eventId", "roundNumber");
CREATE INDEX "ScrimRound_eventId_idx" ON "ScrimRound"("eventId");

ALTER TABLE "ScrimRound" ADD CONSTRAINT "ScrimRound_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ScrimEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed Round 1 for existing events
INSERT INTO "ScrimRound" ("id", "eventId", "roundNumber", "scheduledAt", "result", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), "id", 1, "scheduledAt", 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ScrimEvent";

-- AlterTable ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "channelKey" TEXT NOT NULL DEFAULT 'org';
ALTER TABLE "ChatMessage" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "mediaType" "MediaType";
ALTER TABLE "ChatMessage" ALTER COLUMN "text" DROP NOT NULL;

CREATE INDEX "ChatMessage_orgId_channelKey_createdAt_idx" ON "ChatMessage"("orgId", "channelKey", "createdAt");

-- CreateTable ChatReadState
CREATE TABLE "ChatReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatReadState_userId_orgId_channelKey_key" ON "ChatReadState"("userId", "orgId", "channelKey");

ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

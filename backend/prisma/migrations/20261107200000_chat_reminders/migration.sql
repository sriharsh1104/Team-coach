-- CreateTable
CREATE TABLE "ChatReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "message" VARCHAR(40) NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatReminder_sentAt_fireAt_idx" ON "ChatReminder"("sentAt", "fireAt");

-- CreateIndex
CREATE INDEX "ChatReminder_userId_orgId_channelKey_idx" ON "ChatReminder"("userId", "orgId", "channelKey");

-- AddForeignKey
ALTER TABLE "ChatReminder" ADD CONSTRAINT "ChatReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReminder" ADD CONSTRAINT "ChatReminder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

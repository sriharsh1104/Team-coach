-- Soft-delete placeholders for chat messages ("This message has been deleted").
ALTER TABLE "ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Personal nicknames (viewer-only aliases for other users in the org).
CREATE TABLE "ChatNickname" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "nickname" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatNickname_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatNickname_userId_orgId_targetUserId_key" ON "ChatNickname"("userId", "orgId", "targetUserId");
CREATE INDEX "ChatNickname_userId_orgId_idx" ON "ChatNickname"("userId", "orgId");

ALTER TABLE "ChatNickname" ADD CONSTRAINT "ChatNickname_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatNickname" ADD CONSTRAINT "ChatNickname_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatNickname" ADD CONSTRAINT "ChatNickname_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

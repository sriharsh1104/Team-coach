-- CreateEnum
CREATE TYPE "MiniGameKind" AS ENUM ('RPS', 'LUDO', 'BOOTS', 'CUT', 'CHESS', 'UNO', 'RACE');

-- CreateTable
CREATE TABLE "GameMatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "game" "MiniGameKind" NOT NULL,
    "winnerId" TEXT,
    "endReason" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "game" "MiniGameKind" NOT NULL,
    "won" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GameMatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameMatch_orgId_game_playedAt_idx" ON "GameMatch"("orgId", "game", "playedAt");

-- CreateIndex
CREATE INDEX "GameMatch_orgId_playedAt_idx" ON "GameMatch"("orgId", "playedAt");

-- CreateIndex
CREATE INDEX "GameMatchPlayer_orgId_userId_idx" ON "GameMatchPlayer"("orgId", "userId");

-- CreateIndex
CREATE INDEX "GameMatchPlayer_orgId_game_userId_idx" ON "GameMatchPlayer"("orgId", "game", "userId");

-- CreateIndex
CREATE INDEX "GameMatchPlayer_orgId_userId_won_idx" ON "GameMatchPlayer"("orgId", "userId", "won");

-- CreateIndex
CREATE UNIQUE INDEX "GameMatchPlayer_matchId_userId_key" ON "GameMatchPlayer"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "GameMatch" ADD CONSTRAINT "GameMatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatchPlayer" ADD CONSTRAINT "GameMatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "GameMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatchPlayer" ADD CONSTRAINT "GameMatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "UserGameProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "inGameName" TEXT,
    "inGameUid" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserGameProfile_game_inGameUid_idx" ON "UserGameProfile"("game", "inGameUid");

-- CreateIndex
CREATE INDEX "UserGameProfile_game_inGameName_idx" ON "UserGameProfile"("game", "inGameName");

-- CreateIndex
CREATE UNIQUE INDEX "UserGameProfile_userId_game_key" ON "UserGameProfile"("userId", "game");

-- AddForeignKey
ALTER TABLE "UserGameProfile" ADD CONSTRAINT "UserGameProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Free Fire rows from the legacy User columns so existing profiles
-- show up in the multi-game list without a second save.
INSERT INTO "UserGameProfile" ("id", "userId", "game", "inGameName", "inGameUid", "role", "createdAt", "updatedAt")
SELECT
  CONCAT('c', REPLACE(gen_random_uuid()::text, '-', '')),
  u."id",
  'FREE_FIRE',
  u."inGameName",
  u."inGameUid",
  CASE WHEN cardinality(u."roles") >= 1 THEN u."roles"[1] ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."inGameName" IS NOT NULL
   OR u."inGameUid" IS NOT NULL
   OR cardinality(u."roles") > 0;

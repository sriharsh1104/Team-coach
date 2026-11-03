-- Clear duplicates before adding UNIQUE (keep the oldest row in each group).
-- Email and orgCode / referralToken / org.id are already unique.

WITH dup_phone AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE phone IS NOT NULL
)
UPDATE "User" u
SET phone = NULL
FROM dup_phone d
WHERE u.id = d.id AND d.rn > 1;

WITH dup_ign AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY LOWER("inGameName") ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE "inGameName" IS NOT NULL
)
UPDATE "User" u
SET "inGameName" = NULL
FROM dup_ign d
WHERE u.id = d.id AND d.rn > 1;

WITH dup_uid AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY "inGameUid" ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE "inGameUid" IS NOT NULL
)
UPDATE "User" u
SET "inGameUid" = NULL
FROM dup_uid d
WHERE u.id = d.id AND d.rn > 1;

WITH dup_org AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY "createdAt" ASC) AS rn
  FROM "Org"
)
UPDATE "Org" o
SET name = o.name || '-' || LEFT(o.id, 6)
FROM dup_org d
WHERE o.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX "User_inGameName_key" ON "User"("inGameName");
CREATE UNIQUE INDEX "User_inGameUid_key" ON "User"("inGameUid");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "Org_name_key" ON "Org"("name");

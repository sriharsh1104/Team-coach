-- Normalize phones to digits-only (strip IN 0 / 91 prefix) so +91… and
-- 10-digit forms collide on the existing unique index.

UPDATE "User"
SET phone = regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL;

UPDATE "User"
SET phone = substring(phone FROM 3)
WHERE phone IS NOT NULL
  AND length(phone) = 12
  AND phone LIKE '91%';

UPDATE "User"
SET phone = substring(phone FROM 2)
WHERE phone IS NOT NULL
  AND length(phone) = 11
  AND phone LIKE '0%';

-- If two rows now share a phone, keep the oldest and clear the rest.
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

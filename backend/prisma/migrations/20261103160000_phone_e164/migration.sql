-- Upgrade stored phones to E.164 so country-code pickers and uniqueness match.

UPDATE "User"
SET phone = regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL AND phone NOT LIKE '+%';

UPDATE "User"
SET phone = '+91' || phone
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND length(phone) = 10;

UPDATE "User"
SET phone = '+' || phone
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND length(phone) = 12
  AND phone LIKE '91%';

UPDATE "User"
SET phone = '+91' || substring(phone FROM 2)
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND length(phone) = 11
  AND phone LIKE '0%';

UPDATE "User"
SET phone = '+' || phone
WHERE phone IS NOT NULL AND phone NOT LIKE '+%';

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

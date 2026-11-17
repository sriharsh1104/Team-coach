-- Flip the default for new orgs only (does not touch existing rows).
ALTER TABLE "Org" ALTER COLUMN "historyVisibleToNewMembers" SET DEFAULT true;

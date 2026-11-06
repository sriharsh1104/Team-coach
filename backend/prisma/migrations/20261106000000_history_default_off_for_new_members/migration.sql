-- Change the default for newly created orgs only. Existing orgs keep
-- whatever value they already have (owners may have deliberately left
-- history visible); this does not touch existing rows.
ALTER TABLE "Org" ALTER COLUMN "historyVisibleToNewMembers" SET DEFAULT false;

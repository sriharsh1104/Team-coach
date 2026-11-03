-- The org creator is the owner only. A coach/player/analyst seat is optional
-- and chosen later from the profile, so this column can be empty.
ALTER TABLE "Membership" ALTER COLUMN "role" DROP NOT NULL;

-- AlterEnum
-- New enum values must be committed before they can be used as a column
-- default, so this is a separate migration from the one that sets the new
-- default and adds the new columns (async_extraction_damage).
ALTER TYPE "StatExtractionStatus" ADD VALUE 'QUEUED' BEFORE 'PENDING';
ALTER TYPE "StatExtractionStatus" ADD VALUE 'PROCESSING' BEFORE 'PENDING';
ALTER TYPE "StatExtractionStatus" ADD VALUE 'FAILED';

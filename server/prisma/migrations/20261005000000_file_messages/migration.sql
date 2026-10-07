-- File/document messages: a new enum value and the original filename.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on old
-- PostgreSQL, but every supported version (12+) allows it as long as the new
-- value is not used in the same transaction — and it is not.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'FILE';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "mediaName" TEXT;

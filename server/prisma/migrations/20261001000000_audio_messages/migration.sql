-- Voice notes in chat: a new MessageType that reuses the media columns video
-- already added (mediaUrl, mediaBytes, mediaDurationMs), so there is no table
-- change here.
--
-- ALTER TYPE ... ADD VALUE could not run inside a transaction before PostgreSQL
-- 12, and Prisma applies each migration in one. Render runs PostgreSQL 14+,
-- where it is allowed as long as the new value is not used in the same
-- transaction — and nothing here writes a message.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'AUDIO';

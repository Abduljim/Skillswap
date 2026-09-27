-- Video messages.
--
-- Additive only: no existing row is rewritten and no column is dropped, so an
-- older APK (v1.5 and earlier) keeps working. Old clients simply never send
-- type 'VIDEO' and ignore the new nullable media columns.
--
-- Media itself is NOT stored here. Photos and videos live in Supabase Storage
-- and these columns hold the pointer plus the metadata needed to draw the
-- bubble before the bytes arrive: dimensions for the frame, duration and size
-- for the badge, thumbUrl for the video poster. Storing video as base64 in
-- Postgres is not viable — Render's free database is 512 MB and is deleted 90
-- days after creation.

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VIDEO';

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "thumbUrl" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaBytes" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaWidth" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaHeight" INTEGER;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaDurationMs" INTEGER;

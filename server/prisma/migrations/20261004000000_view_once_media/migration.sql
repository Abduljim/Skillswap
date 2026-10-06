-- View-once media (images, videos, voice notes).
-- Defaults keep every existing row a normal message.
ALTER TABLE "Message"
  ADD COLUMN "viewOnce" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mediaViewedAt" TIMESTAMP(3),
  ADD COLUMN "mediaViewedBy" UUID;

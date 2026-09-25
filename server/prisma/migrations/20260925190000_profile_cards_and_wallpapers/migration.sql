-- Profile cards: the 12 PNG frames are replaced by 6 SVG/CSS cards
-- (1 free "linen" + 5 Pro: aurum, diamond, nova, inferno, sovereign).
-- Remap anything already stored (including the old default) onto the free card
-- so no profile keeps a frame that no longer exists.
UPDATE "Profile"
SET "avatarFrame" = 'linen'
WHERE "avatarFrame" IS NULL
   OR "avatarFrame" NOT IN ('linen', 'aurum', 'diamond', 'nova', 'inferno', 'sovereign');

-- New profiles start on the free card.
ALTER TABLE "Profile" ALTER COLUMN "avatarFrame" SET DEFAULT 'linen';

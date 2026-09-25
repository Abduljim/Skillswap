-- AlterTable
--
-- IF NOT EXISTS is load-bearing, not cosmetic: production was originally built
-- with `prisma db push`, so this column already exists there. A bare ADD COLUMN
-- fails with 42701 ("column tokenVersion of relation User already exists"),
-- Prisma records the migration as failed, and then refuses to apply ANY later
-- migration until the failure is resolved (P3018). Re-running this file must be
-- a no-op on a database that already has the column.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

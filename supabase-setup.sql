-- =============================================================================
-- SkillSwap chat media: Supabase Storage setup
-- =============================================================================
--
-- THIS FILE HAS TWO HALVES AND THEY GO IN DIFFERENT PLACES. Read the header of
-- each part before pasting anything.
--
--   PART 1 (bucket)    -> NOT the SQL editor. Use the Storage dashboard, or run
--                         the curl command from your own machine. Supabase's
--                         hosted Postgres cannot shell out, so `execute 'curl …'`
--                         fails with "could not execute command".
--   PART 2 (policies)  -> Supabase dashboard > SQL Editor > paste > Run.
--
-- Both halves are idempotent: re-running them is harmless.
--
-- Replace the project ref below with yours (Dashboard > Settings > API >
-- "Project URL", the bit before .supabase.co).
-- =============================================================================


-- =============================================================================
-- PART 1 — the bucket            (do this in the dashboard, NOT the SQL editor)
-- =============================================================================
--
-- Option A, easiest:
--   Dashboard > Storage > New bucket
--     Name:        skillswap-media
--     Public:      ON
--   That is the whole thing — leave file size limit and allowed MIME types
--   empty, the API enforces both.
--
-- Option B, from a terminal on your own machine (not in the SQL editor):
--
--   PROJECT_REF=jravxybafgcujstkzvdc
--   SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
--   curl -X POST "https://${PROJECT_REF}.supabase.co/storage/v1/bucket" \
--     -H "apikey: ${SECRET_KEY}" \
--     -H "Authorization: Bearer ${SECRET_KEY}" \
--     -H "Content-Type: application/json" \
--     -d '{"name":"skillswap-media","public":true}'
--
--   Expect {"name":"skillswap-media","public":true}. "The resource already
--   exists" means it is already there, which is fine.
--
-- A secret key (sb_secret_…) must be sent on BOTH apikey and Authorization:
-- the gateway JWT-decodes Authorization: Bearer and a new-style secret key is
-- not a JWT, so sending it only in the bearer header fails with
-- 403 "Invalid Compact JWS". The publishable key (sb_publishable_…) is a
-- different, browser-safe key — see docs/MEDIA.md step 3.
--
-- Public only controls READS. Objects stay readable at
--   https://<ref>.supabase.co/storage/v1/object/public/skillswap-media/<path>
-- and are never listed. Writes still need Part 2.


-- =============================================================================
-- PART 2 — storage policies       (Supabase dashboard > SQL Editor > Run)
-- =============================================================================
--
-- WHY THIS IS REQUIRED
--
-- Storage keeps object metadata in the RLS-protected table storage.objects, and
-- an upload runs INSERT … RETURNING *. With no policies at all, EVERY upload
-- fails with:
--
--   403 {"statusCode":"403","error":"new row violates row-level security policy"}
--
-- even when the signed upload token is valid, the bucket is public, and the
-- request is correctly authenticated. INSERT is needed for the write and SELECT
-- is needed for the RETURNING clause, so both policies are required.
--
-- HOW NARROW THIS IS
--
-- The insert policy accepts only the exact path shape SkillSwap's API
-- generates — <kind>/<first 8 hex chars of the sender>/<date>/<uuid>.<known
-- extension> — and only into this one bucket. Nothing can be written under any
-- other name, into any other bucket, or over an existing object (each upload
-- gets a fresh server-generated UUID path, and the API refuses to confirm a
-- path it never issued).
--
-- The one thing this does mean: someone holding the publishable key — which is
-- public by design and ships inside the app — can upload a file that looks like
-- SkillSwap media without going through the API. They cannot read other users'
-- objects beyond what the public bucket already exposes, cannot overwrite
-- anything, and cannot exceed the bucket's size limits. If you want that
-- surface closed too, enable the optional limits at the end of this file and
-- watch Dashboard > Storage > skillswap-media for objects that never appear in
-- a chat message.

drop policy if exists "skillswap media insert" on storage.objects;
create policy "skillswap media insert" on storage.objects
  for insert to public
  with check (
    bucket_id = 'skillswap-media'
    and name ~ '^(video|image)/[0-9a-f]{8}/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](mp4|webm|mov|3gp|m4v|mpg|jpg|jpeg|png|webp|gif)$'
  );

drop policy if exists "skillswap media read" on storage.objects;
create policy "skillswap media read" on storage.objects
  for select to public
  using (bucket_id = 'skillswap-media');

-- Confirm both landed:
select policyname, cmd, roles from pg_policies
 where schemaname = 'storage' and tablename = 'objects';


-- =============================================================================
-- OPTIONAL — belt and braces, run only after video messages are working
-- =============================================================================
--
-- Caps what the bucket will physically accept, on top of the limits the API
-- already enforces. Left commented out so that a failed upload during setup has
-- only one possible cause. If you enable it and uploads then fail with 413 or
-- 415, this is why.
--
-- update storage.buckets
--    set file_size_limit  = 67108864,
--        allowed_mime_types = array[
--          'video/mp4','video/webm','video/quicktime','video/3gpp',
--          'video/x-m4v','video/mpeg',
--          'image/jpeg','image/png','image/webp','image/gif'
--        ]
--  where id = 'skillswap-media';

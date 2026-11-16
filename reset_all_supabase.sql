-- ============================================================================
-- reset_all_supabase.sql
-- Deletes EVERY piece of data across ALL tables in `public` and ALL files in
-- Supabase Storage so your database starts 100% empty (zero).
--
-- Login accounts (`public.profiles` and `auth.users`) are kept by default so
-- you can still log into the POS app. Uncomment the bottom block if you want
-- to delete all user accounts too.
--
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================================

-- 1. Truncate every table in `public` (except `profiles` so login keeps working)
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> 'profiles';

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;

-- 2. Delete every uploaded file in Supabase Storage (across all buckets)
DELETE FROM storage.objects;

-- 3. OPTIONAL: Uncomment the 2 lines below ONLY if you also want to delete
--    all user accounts and roles (you will have to create a new user in Auth):
-- TRUNCATE TABLE public.profiles RESTART IDENTITY CASCADE;
-- DELETE FROM auth.users;

-- 4. Verification: check remaining row counts in all `public` tables
SELECT
  tablename,
  (xpath('/row/cnt/text()', query_to_xml(format('SELECT count(*) AS cnt FROM public.%I', tablename), false, true, '')))[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

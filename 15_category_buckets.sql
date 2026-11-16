-- ============================================================================
-- 15_category_buckets.sql
-- One public Storage bucket per product category for /quick-add.
-- Run once in the Supabase SQL Editor.
--
-- Bucket ids look like  cat-panjabi, cat-home-goods, cat-uncategorized.
-- Browsers cannot create buckets directly, so the app calls the function below
-- (SECURITY DEFINER) the first time a category is used.
-- ============================================================================

-- 1. Function that creates a category bucket on demand (public read)
CREATE OR REPLACE FUNCTION public.ensure_category_bucket(_bucket text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF _bucket IS NULL OR _bucket !~ '^cat-[a-z0-9-]{1,58}$' THEN
    RAISE EXCEPTION 'Invalid category bucket name: %', _bucket;
  END IF;

  INSERT INTO storage.buckets (id, name, public)
  VALUES (_bucket, _bucket, true)
  ON CONFLICT (id) DO NOTHING;

  RETURN _bucket;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_category_bucket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_category_bucket(text) TO authenticated;

-- 2. One set of policies that covers EVERY category bucket (ids start with cat-)
DROP POLICY IF EXISTS "Category Buckets Read" ON storage.objects;
CREATE POLICY "Category Buckets Read"
  ON storage.objects FOR SELECT
  USING (bucket_id LIKE 'cat-%');

DROP POLICY IF EXISTS "Category Buckets Insert" ON storage.objects;
CREATE POLICY "Category Buckets Insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id LIKE 'cat-%');

DROP POLICY IF EXISTS "Category Buckets Delete" ON storage.objects;
CREATE POLICY "Category Buckets Delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id LIKE 'cat-%');


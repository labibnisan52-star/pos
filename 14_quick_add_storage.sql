-- ============================================================================
-- 14_quick_add_storage.sql
-- Storage setup for the /quick-add page. Run once in the Supabase SQL Editor.
--
-- The project already uses the public bucket `product_images` (see
-- supabase_db.sql), so Quick Add reuses it instead of creating a second bucket.
-- Read + upload policies already exist there; the only missing piece is DELETE,
-- which "Undo" needs to remove the image file.
-- ============================================================================

-- 1. Bucket (no-op if it already exists; kept public for read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product_images', 'product_images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Read + upload policies (idempotent; same names as supabase_db.sql)
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product_images');

DROP POLICY IF EXISTS "Public Insert Access" ON storage.objects;
CREATE POLICY "Public Insert Access"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product_images');

-- 3. NEW: allow logged-in users to delete product images (needed for Undo)
DROP POLICY IF EXISTS "Authenticated Delete Product Images" ON storage.objects;
CREATE POLICY "Authenticated Delete Product Images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product_images');


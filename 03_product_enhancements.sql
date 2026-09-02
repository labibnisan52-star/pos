-- ============================================================
-- PRODUCT ENHANCEMENTS MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Step 1: Add new columns to products table ──────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text DEFAULT 'Piece';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'Single';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_type text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warranty text;

-- ── Step 2: Create product_variants table ───────────────────
CREATE TABLE IF NOT EXISTS public.product_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  product_id     uuid REFERENCES public.products(id) ON DELETE CASCADE,
  image_url      text,
  variant_name   text NOT NULL,
  variant_value  text NOT NULL,
  sku            text NOT NULL
);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_anon" ON public.product_variants;
CREATE POLICY "allow_all_anon" ON public.product_variants
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.product_variants TO anon, authenticated, service_role;

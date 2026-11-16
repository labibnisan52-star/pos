-- ============================================================================
-- 15_product_embeddings.sql
-- Visual Product Search: product_embeddings table, indexes, and role-based RLS
-- Run ONCE in Supabase SQL Editor. Does not modify existing tables or RPCs.
-- ============================================================================

-- ── 1. Stable owner-check helper (avoids recursive RLS lookups on profiles) ──
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;

-- ── 2. product_embeddings table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_embeddings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id       uuid NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  model_name       text NOT NULL,
  embedding        real[] NOT NULL CHECK (array_length(embedding, 1) = 512),
  source_image_url text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_embeddings_product_id
  ON public.product_embeddings (product_id);

CREATE INDEX IF NOT EXISTS idx_product_embeddings_variant_id
  ON public.product_embeddings (variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_embeddings_updated_at
  ON public.product_embeddings (updated_at);

-- ── 3. Auto-maintain updated_at for cursor-based incremental sync ────────────
CREATE OR REPLACE FUNCTION public.set_product_embeddings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_embeddings_updated_at ON public.product_embeddings;
CREATE TRIGGER trg_product_embeddings_updated_at
  BEFORE UPDATE ON public.product_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_product_embeddings_updated_at();

-- ── 4. Role-based Row Level Security ─────────────────────────────────────────
ALTER TABLE public.product_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can view product embeddings" ON public.product_embeddings;
CREATE POLICY "Authenticated staff can view product embeddings"
  ON public.product_embeddings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Owners can insert product embeddings" ON public.product_embeddings;
CREATE POLICY "Owners can insert product embeddings"
  ON public.product_embeddings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Owners can update product embeddings" ON public.product_embeddings;
CREATE POLICY "Owners can update product embeddings"
  ON public.product_embeddings
  FOR UPDATE
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Owners can delete product embeddings" ON public.product_embeddings;
CREATE POLICY "Owners can delete product embeddings"
  ON public.product_embeddings
  FOR DELETE
  TO authenticated
  USING (public.is_owner());

REVOKE ALL ON TABLE public.product_embeddings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_embeddings TO authenticated;
GRANT ALL ON TABLE public.product_embeddings TO service_role;


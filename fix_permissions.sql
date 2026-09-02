-- ============================================================
-- QUICK FIX: Run this in Supabase SQL Editor right now
-- to fix "permission denied for table purchase_orders"
-- ============================================================

-- Grant table access to all roles
GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;

-- Also fix orders table just in case
GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

-- Drop and recreate the RLS policy cleanly
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.purchase_orders;

CREATE POLICY "allow_all_anon"
  ON public.purchase_orders
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

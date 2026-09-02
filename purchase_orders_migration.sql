-- ============================================================
-- MIGRATION: Create purchase_orders table
-- Run this once in your Supabase SQL Editor
-- ============================================================

-- Step 0: Add 'status' column to existing orders table (if not already there)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Completed';

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  supplier_name  text NOT NULL DEFAULT 'Unknown',
  product_id     uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name   text NOT NULL DEFAULT '',
  quantity       integer NOT NULL DEFAULT 1,
  cost_cny       numeric NOT NULL DEFAULT 0,
  cost_bdt       numeric NOT NULL DEFAULT 0,
  shipping_bdt   numeric NOT NULL DEFAULT 0,
  total_cost     numeric NOT NULL DEFAULT 0,
  selling_price  numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash',
  received_by    text NOT NULL DEFAULT 'Store Manager',
  status         text NOT NULL DEFAULT 'Received'
);

-- Enable Row Level Security (same as other tables)
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon and authenticated roles
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.purchase_orders;
CREATE POLICY "allow_all_anon"
  ON public.purchase_orders
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Grant explicit table permissions (required alongside RLS)
GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;

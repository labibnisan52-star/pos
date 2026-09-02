-- ============================================================
-- COMPLETE MIGRATION — Run this ONCE in Supabase SQL Editor
-- Covers: orders.status, purchase_orders, sales_returns
-- ============================================================

-- ── Step 1: Add status column to orders table ──────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Completed';

-- ── Step 2: Create purchase_orders table ───────────────────
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

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.purchase_orders;
DROP POLICY IF EXISTS "allow_all_anon" ON public.purchase_orders;
CREATE POLICY "allow_all_anon" ON public.purchase_orders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.purchase_orders TO anon, authenticated, service_role;

-- ── Step 3: Create sales_returns table ─────────────────────
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  order_id       uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_name  text NOT NULL DEFAULT '',
  customer_mobile text NOT NULL DEFAULT '',
  refund_amount  numeric NOT NULL DEFAULT 0,
  refund_method  text NOT NULL DEFAULT 'Cash',
  reason         text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  restocked      boolean NOT NULL DEFAULT true,
  item_count     integer NOT NULL DEFAULT 0
);

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_anon" ON public.sales_returns;
CREATE POLICY "allow_all_anon" ON public.sales_returns
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.sales_returns TO anon, authenticated, service_role;

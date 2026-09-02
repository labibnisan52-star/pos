-- ============================================================
-- FIX HISTORICAL DATA: COGS
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Fix old Order Items by pulling the REAL cost price you just typed in!
UPDATE public.order_items oi
SET unit_cost_price = p.cost_price,
    unit_selling_price = oi.price
FROM public.products p
WHERE oi.product_id = p.id 
  AND (oi.unit_cost_price = 0 OR oi.unit_selling_price = 0);

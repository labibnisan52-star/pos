-- ============================================================================
-- sql/sync_purchase_costs_with_products.sql
--
-- WHY "TOTAL PURCHASE COST" (৳34,020.00 / 63 batches) DID NOT MATCH YOUR BUYING VALUE:
--   1. When products were later Edited in "Edit Product" to fix Cost Price or Stock,
--      the old code updated `public.products` (`cost_price` and `stock`) but NEVER
--      updated `public.purchase_orders` (`total_cost` and `quantity`).
--   2. When old/demo products were deleted from `public.products`, their rows in
--      `public.purchase_orders` were NOT deleted (`product_id` became NULL), leaving
--      ghost purchase batches that still added into "Total Purchase Cost".
--   3. If a product was initially created with Stock = 0, the old code calculated
--      `total_cost = trueLandedCost * (Number(stock) || 1)` (multiplying by 1 instead of 0!).
-- ============================================================================

-- ============================================================================
-- STEP 1: PREVIEW THE MISMATCH (Read-only — safe to run anytime)
-- ============================================================================
SELECT
  (SELECT ROUND(COALESCE(SUM(COALESCE(cost_price, 0) * COALESCE(stock, 0)), 0), 2) FROM public.products) AS real_inventory_buying_value,
  (SELECT COUNT(*) FROM public.products WHERE COALESCE(stock, 0) > 0) AS active_products_in_stock,
  (SELECT ROUND(COALESCE(SUM(total_cost), 0), 2) FROM public.purchase_orders) AS old_purchase_orders_total,
  (SELECT COUNT(*) FROM public.purchase_orders) AS old_purchase_batches_count,
  (SELECT COUNT(*) FROM public.purchase_orders WHERE product_id IS NULL) AS orphan_batches_from_deleted_products;


-- ============================================================================
-- STEP 2: SYNC purchase_orders TO MATCH YOUR REAL PRODUCT BUYING VALUES
-- Run this in Supabase SQL Editor to make "Total Purchase Cost" match your
-- real product buying values (cost_price * stock) 100%.
-- ============================================================================

BEGIN;

-- 1. Remove all stale purchase_orders rows (including orphan rows from deleted
--    products and outdated initial batches that had old cost prices / quantities)
DELETE FROM public.purchase_orders;

-- 2. Rebuild one clean purchase batch per product from your authoritative
--    `public.products` table (cost_price × stock)
INSERT INTO public.purchase_orders (
  created_at,
  product_id,
  product_name,
  supplier_name,
  quantity,
  remaining_quantity,
  cost_cny,
  cost_bdt,
  shipping_bdt,
  total_cost,
  selling_price,
  payment_method,
  received_by,
  status
)
SELECT
  COALESCE(p.created_at, now()),
  p.id,
  p.name,
  'Direct Intake',
  GREATEST(COALESCE(p.stock, 0), 0),
  GREATEST(COALESCE(p.stock, 0), 0),
  0,
  ROUND(COALESCE(p.cost_price, 0), 2),
  0,
  ROUND(COALESCE(p.cost_price, 0) * GREATEST(COALESCE(p.stock, 0), 0), 2),
  ROUND(COALESCE(p.price, 0), 2),
  'Cash',
  'Store Manager',
  'Received'
FROM public.products p
WHERE GREATEST(COALESCE(p.stock, 0), 0) > 0;

-- 3. Also ensure historical order_items use the product's real cost_price
UPDATE public.order_items oi
SET unit_cost_price = ROUND(COALESCE(p.cost_price, 0), 2)
FROM public.products p
WHERE oi.product_id = p.id
  AND COALESCE(oi.unit_cost_price, 0) <> ROUND(COALESCE(p.cost_price, 0), 2);

COMMIT;

-- Verify after running:
SELECT
  COUNT(*) AS synced_batches,
  ROUND(COALESCE(SUM(total_cost), 0), 2) AS new_total_purchase_cost
FROM public.purchase_orders;

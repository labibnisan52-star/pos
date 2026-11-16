-- ============================================================================
-- backfill_purchases_from_products.sql
-- Backfills purchase_orders for any existing products (e.g. from earlier
-- Quick Add entries) that have stock > 0 and no matching purchase_orders row.
-- Safe to run multiple times (skips products that already have a purchase row).
-- ============================================================================

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
  p.created_at,
  p.id,
  p.name,
  'Direct Intake',
  p.stock,
  p.stock,
  0,
  ROUND(COALESCE(p.cost_price, 0), 2),
  0,
  ROUND(COALESCE(p.cost_price, 0) * p.stock, 2),
  ROUND(COALESCE(p.price, 0), 2),
  'Cash',
  'Store Manager',
  'Received'
FROM public.products p
WHERE p.stock > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.product_id = p.id
  );


-- ============================================================================
-- reset_sales_and_dues.sql
-- Run this in Supabase SQL Editor to wipe previous sales, dues, payments & returns.
-- Starts everything from ZERO while preserving products, categories & settings.
-- ============================================================================

-- 1. Wipe returns (child of order_items & orders)
DELETE FROM public.returns;
DELETE FROM public.sales_returns;

-- 2. Wipe payments (child of orders)
DELETE FROM public.payments;

-- 3. Wipe order items (child of orders)
DELETE FROM public.order_items;

-- 4. Wipe orders (sales records, dues, profits)
DELETE FROM public.orders;

-- 5. Optional: If you also want to wipe expenses so Net Profit starts at ৳0:
DELETE FROM public.expenses;

-- 6. Verification query (should all output 0)
SELECT 
  (SELECT COUNT(*) FROM public.orders) AS remaining_orders,
  (SELECT COUNT(*) FROM public.order_items) AS remaining_order_items,
  (SELECT COUNT(*) FROM public.payments) AS remaining_payments,
  (SELECT COUNT(*) FROM public.sales_returns) AS remaining_returns,
  (SELECT COUNT(*) FROM public.expenses) AS remaining_expenses;


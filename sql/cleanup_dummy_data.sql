-- ============================================================================
-- sql/cleanup_dummy_data.sql
-- REVIEW ONLY — NOT EXECUTED AUTOMATICALLY.
-- Wait until you have reviewed Step 1 preview results in Supabase SQL Editor
-- before running Step 2.
--
-- Purpose:
--   Deletes ONLY known seed/demo products, legacy ৳0 empty customer-seed orders,
--   and any test/demo rows in strict foreign-key order without touching your
--   schema, migrations, auth accounts, or real shoe inventory/orders.
-- ============================================================================

-- ============================================================================
-- STEP 1: READ-ONLY PREVIEW (Run this first to inspect what will be removed)
-- ============================================================================

-- 1A. Preview legacy ৳0 customer-seed orders (created by the old "Add Customer"
--     modal, which inserted fake Completed orders with total_amount = 0 and 0 items)
SELECT o.id, o.created_at, o.customer_name, o.customer_mobile, o.total_amount, o.status
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
WHERE COALESCE(o.total_amount, 0) = 0
  AND COALESCE(o.grand_total, 0) = 0
GROUP BY o.id
HAVING COUNT(oi.id) = 0;

-- 1B. Preview known initial template products (from the original non-shoe template)
SELECT id, name, barcode, category, price, stock
FROM public.products
WHERE barcode IN ('1001', '1002', '1003', '1004', '1005', '1006', '00001001', '00001002', '00001003', '00001004', '00001005', '00001006')
   OR name IN (
     'Steel Water Bottle',
     'Potted Plant',
     'Classic Leather Wallet',
     'Hand Soap Dispenser',
     'Linen Notebook',
     'Noise Cancelling Headphones',
     'Ceramic V60 Dripper'
   );

-- 1C. Preview orders that ONLY contain those template products (or have test customer names)
SELECT DISTINCT o.id, o.created_at, o.customer_name, o.total_amount
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
LEFT JOIN public.products p ON p.id = oi.product_id
WHERE p.barcode IN ('1001', '1002', '1003', '1004', '1005', '1006', '00001001', '00001002', '00001003', '00001004', '00001005', '00001006')
   OR p.name IN (
     'Steel Water Bottle',
     'Potted Plant',
     'Classic Leather Wallet',
     'Hand Soap Dispenser',
     'Linen Notebook',
     'Noise Cancelling Headphones',
     'Ceramic V60 Dripper'
   );


-- ============================================================================
-- STEP 2: TRANSACTIONAL CLEANUP (In strict Foreign-Key dependency order)
-- Run ONLY after confirming Step 1 above.
-- (Note: Run 12_pos_overhaul.sql first so public.customers & public.payments exist.)
-- ============================================================================

BEGIN;

-- 0. Preserve real customer names/phones from legacy ৳0 customer-seed orders
--    into the dedicated public.customers table BEFORE deleting those ৳0 orders.
INSERT INTO public.customers (name, mobile)
SELECT DISTINCT TRIM(o.customer_name), COALESCE(TRIM(o.customer_mobile), '')
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
WHERE COALESCE(o.total_amount, 0) = 0
  AND COALESCE(o.grand_total, 0) = 0
  AND o.customer_name IS NOT NULL
  AND TRIM(o.customer_name) <> ''
  AND LOWER(TRIM(o.customer_name)) NOT IN ('guest', 'walk-in customer')
  AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE LOWER(c.name) = LOWER(TRIM(o.customer_name))
  )
GROUP BY o.id, o.customer_name, o.customer_mobile
HAVING COUNT(oi.id) = 0;

-- Identify target template products and target non-real orders in temp tables
CREATE TEMP TABLE _target_products ON COMMIT DROP AS
SELECT id
FROM public.products
WHERE barcode IN ('1001', '1002', '1003', '1004', '1005', '1006', '00001001', '00001002', '00001003', '00001004', '00001005', '00001006')
   OR name IN (
     'Steel Water Bottle',
     'Potted Plant',
     'Classic Leather Wallet',
     'Hand Soap Dispenser',
     'Linen Notebook',
     'Noise Cancelling Headphones',
     'Ceramic V60 Dripper'
   );

CREATE TEMP TABLE _target_orders ON COMMIT DROP AS
-- (a) Legacy ৳0 empty customer-seed orders
SELECT o.id
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
WHERE COALESCE(o.total_amount, 0) = 0
  AND COALESCE(o.grand_total, 0) = 0
GROUP BY o.id
HAVING COUNT(oi.id) = 0
UNION
-- (b) Orders linked to the template products above
SELECT DISTINCT oi.order_id
FROM public.order_items oi
WHERE oi.product_id IN (SELECT id FROM _target_products);

-- 1. Delete FIFO return line items referencing target orders or target products
DELETE FROM public.returns
WHERE order_id IN (SELECT id FROM _target_orders)
   OR order_item_id IN (
     SELECT id FROM public.order_items
     WHERE order_id IN (SELECT id FROM _target_orders)
        OR product_id IN (SELECT id FROM _target_products)
   );

-- 2. Delete UI sales_returns referencing target orders
DELETE FROM public.sales_returns
WHERE order_id IN (SELECT id FROM _target_orders);

-- 3. Delete payments referencing target orders
DELETE FROM public.payments
WHERE order_id IN (SELECT id FROM _target_orders);

-- 4. Delete order_items referencing target orders or target products
DELETE FROM public.order_items
WHERE order_id IN (SELECT id FROM _target_orders)
   OR product_id IN (SELECT id FROM _target_products);

-- 5. Delete target orders
DELETE FROM public.orders
WHERE id IN (SELECT id FROM _target_orders);

-- 6. Delete purchase_orders referencing target products
DELETE FROM public.purchase_orders
WHERE product_id IN (SELECT id FROM _target_products)
   OR product_name IN (
     'Steel Water Bottle',
     'Potted Plant',
     'Classic Leather Wallet',
     'Hand Soap Dispenser',
     'Linen Notebook',
     'Noise Cancelling Headphones',
     'Ceramic V60 Dripper'
   );

-- 7. Delete product_variants referencing target products
DELETE FROM public.product_variants
WHERE product_id IN (SELECT id FROM _target_products);

-- 8. Finally, delete target products
DELETE FROM public.products
WHERE id IN (SELECT id FROM _target_products);

COMMIT;


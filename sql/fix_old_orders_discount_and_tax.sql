-- ============================================================================
-- sql/fix_old_orders_discount_and_tax.sql
-- REVIEW ONLY — NOT EXECUTED AUTOMATICALLY.
-- Run 12_pos_overhaul.sql BEFORE running this script so the new breakdown
-- columns exist on public.orders and public.order_items.
--
-- WARNING — WHY OLD ORDERS IN YOUR DB MAY HAVE WRONG TOTALS:
--   1. The old POS screen computed:
--        subtotal   = SUM(price * quantity)
--        after_disc = GREATEST(0, subtotal - discount)
--        fake_tax   = after_disc * 0.08          -- <-- bogus 8% tax!
--        finalTotal = after_disc + fake_tax      -- <-- saved into orders.total_amount
--   2. Worse, when saving the order, the old POS hardcoded:
--        _discount = 0, _tax = 0
--      so orders.discount was saved as 0 even when a discount was given, AND
--      orders.total_amount was inflated by 8%!
--
-- HOW THIS SCRIPT RECOVERS & BACKFILLS HISTORICAL ORDERS:
--   For every historical order (where subtotal = 0 / not yet migrated) that has
--   order_items:
--   - Computes true item subtotal = ROUND(SUM(COALESCE(unit_selling_price, price) * quantity), 2).
--   - Detects whether total_amount had the bogus 8% tax baked in:
--       pre_tax_estimate = ROUND(total_amount / 1.08, 2)
--       If pre_tax_estimate <= true_subtotal AND (
--            ABS(ROUND(true_subtotal * 1.08, 2) - total_amount) <= 0.05
--            OR total_amount > true_subtotal
--            OR ROUND(true_subtotal - pre_tax_estimate, 2) >= 0
--          ),
--       we strip the 8% tax to recover the true payable grand_total = pre_tax_estimate
--       and recovered discount_amount = GREATEST(0, ROUND(true_subtotal - pre_tax_estimate, 2)).
--   - Sets tax = 0 (Tax is ALWAYS 0 in Rizq POS).
--   - Backfills subtotal, discount_type, discount_value, discount_amount, discount,
--     grand_total, total_amount, amount_received, paid_amount, change, due_amount,
--     and payment_status on public.orders.
--   - Backfills line_total, discount_share, and net_amount on public.order_items.
-- ============================================================================

-- ============================================================================
-- STEP 1: READ-ONLY PREVIEW (Run this first to inspect proposed corrections)
-- ============================================================================

WITH item_sums AS (
  SELECT
    oi.order_id,
    ROUND(SUM(ROUND(COALESCE(oi.unit_selling_price, oi.price, 0) * oi.quantity, 2)), 2) AS calc_subtotal
  FROM public.order_items oi
  GROUP BY oi.order_id
),
recalculated AS (
  SELECT
    o.id,
    o.created_at,
    o.customer_name,
    s.calc_subtotal AS true_subtotal,
    o.total_amount AS old_saved_total_amount,
    o.discount AS old_saved_discount,
    o.tax AS old_saved_tax,
    CASE
      -- Case 1: Explicit discount column was populated without 8% inflation
      WHEN COALESCE(o.discount, 0) > 0
       AND ABS(ROUND(s.calc_subtotal - COALESCE(o.discount, 0), 2) - COALESCE(o.total_amount, 0)) <= 0.05
      THEN LEAST(ROUND(COALESCE(o.discount, 0), 2), s.calc_subtotal)

      -- Case 2: Old POS saved total_amount = (subtotal - discount) * 1.08
      WHEN ROUND(COALESCE(o.total_amount, 0) / 1.08, 2) <= s.calc_subtotal
       AND (
         COALESCE(o.total_amount, 0) > s.calc_subtotal
         OR ABS(ROUND(s.calc_subtotal * 1.08, 2) - COALESCE(o.total_amount, 0)) <= 0.05
         OR COALESCE(o.total_amount, 0) < s.calc_subtotal
       )
      THEN GREATEST(0, ROUND(s.calc_subtotal - ROUND(COALESCE(o.total_amount, 0) / 1.08, 2), 2))

      -- Case 3: total_amount was already net without 8% tax
      WHEN COALESCE(o.total_amount, 0) <= s.calc_subtotal
      THEN GREATEST(0, ROUND(s.calc_subtotal - COALESCE(o.total_amount, 0), 2))

      ELSE 0
    END AS new_discount_amount
  FROM public.orders o
  JOIN item_sums s ON s.order_id = o.id
  WHERE COALESCE(o.subtotal, 0) = 0
)
SELECT
  id AS order_id,
  created_at,
  customer_name,
  true_subtotal,
  old_saved_total_amount,
  new_discount_amount,
  GREATEST(0, ROUND(true_subtotal - new_discount_amount, 2)) AS new_grand_total,
  ROUND(old_saved_total_amount - GREATEST(0, ROUND(true_subtotal - new_discount_amount, 2)), 2) AS overcharge_from_fake_8pct_tax
FROM recalculated
ORDER BY created_at DESC;


-- ============================================================================
-- STEP 2: APPLY RECALCULATION IN ONE TRANSACTION
-- Run ONLY after reviewing Step 1 output above.
-- ============================================================================

BEGIN;

WITH item_sums AS (
  SELECT
    oi.order_id,
    ROUND(SUM(ROUND(COALESCE(oi.unit_selling_price, oi.price, 0) * oi.quantity, 2)), 2) AS calc_subtotal
  FROM public.order_items oi
  GROUP BY oi.order_id
),
recalculated AS (
  SELECT
    o.id,
    s.calc_subtotal AS true_subtotal,
    CASE
      WHEN COALESCE(o.discount, 0) > 0
       AND ABS(ROUND(s.calc_subtotal - COALESCE(o.discount, 0), 2) - COALESCE(o.total_amount, 0)) <= 0.05
      THEN LEAST(ROUND(COALESCE(o.discount, 0), 2), s.calc_subtotal)

      WHEN ROUND(COALESCE(o.total_amount, 0) / 1.08, 2) <= s.calc_subtotal
       AND (
         COALESCE(o.total_amount, 0) > s.calc_subtotal
         OR ABS(ROUND(s.calc_subtotal * 1.08, 2) - COALESCE(o.total_amount, 0)) <= 0.05
         OR COALESCE(o.total_amount, 0) < s.calc_subtotal
       )
      THEN GREATEST(0, ROUND(s.calc_subtotal - ROUND(COALESCE(o.total_amount, 0) / 1.08, 2), 2))

      WHEN COALESCE(o.total_amount, 0) <= s.calc_subtotal
      THEN GREATEST(0, ROUND(s.calc_subtotal - COALESCE(o.total_amount, 0), 2))

      ELSE 0
    END AS new_discount_amount
  FROM public.orders o
  JOIN item_sums s ON s.order_id = o.id
  WHERE COALESCE(o.subtotal, 0) = 0
)
UPDATE public.orders o
SET
  subtotal        = r.true_subtotal,
  discount_type   = 'fixed',
  discount_value  = r.new_discount_amount,
  discount_amount = r.new_discount_amount,
  discount        = r.new_discount_amount,
  tax             = 0, -- Tax is ALWAYS 0 (column preserved, never dropped)
  grand_total     = GREATEST(0, ROUND(r.true_subtotal - r.new_discount_amount, 2)),
  total_amount    = GREATEST(0, ROUND(r.true_subtotal - r.new_discount_amount, 2)),
  amount_received = GREATEST(0, ROUND(r.true_subtotal - r.new_discount_amount, 2)),
  paid_amount     = GREATEST(0, ROUND(r.true_subtotal - r.new_discount_amount, 2)),
  "change"        = 0,
  due_amount      = 0,
  payment_status  = 'Paid'
FROM recalculated r
WHERE o.id = r.id;

-- Backfill order_items.line_total, discount_share, and net_amount so returns
-- on historical orders also refund the exact discounted net item price
WITH ranked_items AS (
  SELECT
    oi.id,
    oi.order_id,
    ROUND(COALESCE(oi.unit_selling_price, oi.price, 0) * oi.quantity, 2) AS calc_line_total,
    o.subtotal AS order_subtotal,
    o.discount_amount AS order_discount,
    ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.id) AS rn,
    COUNT(*) OVER (PARTITION BY oi.order_id) AS cnt
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE COALESCE(oi.line_total, 0) = 0
),
prelim_shares AS (
  SELECT
    ri.*,
    CASE
      WHEN ri.order_subtotal > 0 AND ri.order_discount > 0
      THEN ROUND((ri.order_discount * ri.calc_line_total) / ri.order_subtotal, 2)
      ELSE 0
    END AS raw_share
  FROM ranked_items ri
),
final_shares AS (
  SELECT
    ps.id,
    ps.calc_line_total,
    CASE
      WHEN ps.order_subtotal > 0 AND ps.order_discount > 0 AND ps.rn = ps.cnt
      THEN GREATEST(
        0,
        ROUND(
          ps.order_discount - COALESCE(
            SUM(CASE WHEN ps.rn < ps.cnt THEN ps.raw_share ELSE 0 END)
              OVER (PARTITION BY ps.order_id),
            0
          ),
          2
        )
      )
      ELSE ps.raw_share
    END AS final_discount_share
  FROM prelim_shares ps
)
UPDATE public.order_items oi
SET
  line_total     = fs.calc_line_total,
  discount_share = fs.final_discount_share,
  net_amount     = GREATEST(0, ROUND(fs.calc_line_total - fs.final_discount_share, 2))
FROM final_shares fs
WHERE oi.id = fs.id;

COMMIT;


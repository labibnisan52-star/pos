-- ============================================================================
-- 12_pos_overhaul.sql — Rizq POS Single-Step Sale, Exact BDT Calculations & Schema
-- Run this ONCE in Supabase SQL Editor.
-- NOTE: Does NOT drop any existing columns (orders.tax is kept at default 0, unused).
-- ============================================================================

-- ── 1. Add complete money & payment breakdown columns to public.orders ──────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'fixed';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS grand_total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_received numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS "change" numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS due_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Paid';

-- ── 2. Add variant & net-item fields to public.order_items ──────────────────
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_label text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_total numeric NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_share numeric NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS net_amount numeric NOT NULL DEFAULT 0;

-- ── 3. Create public.payments table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method  text NOT NULL DEFAULT 'Cash',
  amount_received numeric NOT NULL DEFAULT 0,
  paid_amount     numeric NOT NULL DEFAULT 0,
  "change"        numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_payments" ON public.payments;
CREATE POLICY "allow_all_payments"
  ON public.payments FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.payments TO anon, authenticated, service_role;

-- ── 4. Create public.customers table (replaces ৳0 dummy seed orders) ────────
CREATE TABLE IF NOT EXISTS public.customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name       text NOT NULL,
  mobile     text NOT NULL DEFAULT '',
  notes      text
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers (mobile);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_customers" ON public.customers;
CREATE POLICY "allow_all_customers"
  ON public.customers FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.customers TO anon, authenticated, service_role;

-- ── 5. Atomic single-step sale RPC (order + order_items + payment + stock) ──
-- Recalculates ALL totals server-side from authoritative DB prices & stock.
-- Never trusts totals sent from the browser, and rolls back completely on error.
CREATE OR REPLACE FUNCTION public.complete_sale_tx(
  _items jsonb,
  _discount_type text DEFAULT 'fixed',
  _discount_value numeric DEFAULT 0,
  _amount_received numeric DEFAULT 0,
  _payment_method text DEFAULT 'Cash',
  _customer_name text DEFAULT '',
  _customer_mobile text DEFAULT ''
) RETURNS jsonb AS $$
DECLARE
  _order_id uuid;
  _created_at timestamptz;
  _item jsonb;
  _product record;
  _variant record;

  _product_id uuid;
  _variant_id uuid;
  _qty integer;
  _unit_price numeric;
  _stock_multiplier numeric;
  _variant_label text;
  _line_total numeric;

  _subtotal numeric := 0;
  _norm_discount_type text;
  _norm_discount_value numeric := 0;
  _discount_amount numeric := 0;
  _grand_total numeric := 0;
  _safe_received numeric := 0;
  _change_val numeric := 0;
  _due_val numeric := 0;
  _paid_val numeric := 0;
  _payment_status text := 'Paid';

  _clean_customer_name text;
  _clean_customer_mobile text;

  _prepared_items jsonb := '[]'::jsonb;
  _prep jsonb;
  _idx integer := 0;
  _item_count integer := 0;
  _allocated_discount_sum numeric := 0;
  _item_discount_share numeric := 0;
  _item_net_amount numeric := 0;

  _qty_to_fulfill numeric;
  _total_cogs numeric;
  _batch record;
  _fallback_cost numeric;
  _final_unit_cost numeric;
BEGIN
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty. Add at least one item.';
  END IF;

  -- First pass: lock products, verify total stock per product, and build authoritative line items
  -- Check aggregate stock per base product first
  FOR _product IN
    WITH req AS (
      SELECT
        (elem->>'id')::uuid AS pid,
        NULLIF(elem->>'variant_id', '')::uuid AS vid,
        (elem->>'quantity')::integer AS qty
      FROM jsonb_array_elements(_items) AS elem
    ),
    req_with_mult AS (
      SELECT
        r.pid,
        r.qty,
        COALESCE(pv.stock_multiplier, 1) AS mult
      FROM req r
      LEFT JOIN public.product_variants pv ON pv.id = r.vid AND pv.product_id = r.pid
    ),
    agg AS (
      SELECT pid, SUM(qty * mult) AS total_needed, MIN(qty) AS min_qty
      FROM req_with_mult
      GROUP BY pid
    )
    SELECT p.id, p.name, p.stock, a.total_needed, a.min_qty
    FROM agg a
    JOIN public.products p ON p.id = a.pid
    FOR UPDATE OF p
  LOOP
    IF _product.min_qty IS NULL OR _product.min_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product "%".', _product.name;
    END IF;
    IF _product.stock < _product.total_needed THEN
      RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %).',
        _product.name, _product.stock, _product.total_needed;
    END IF;
  END LOOP;

  -- Build line items using authoritative DB prices
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _product_id := (_item->>'id')::uuid;
    _variant_id := NULLIF(_item->>'variant_id', '')::uuid;
    _qty := (_item->>'quantity')::integer;

    SELECT id, name, price, cost_price, stock
    INTO _product
    FROM public.products
    WHERE id = _product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', _product_id;
    END IF;

    _unit_price := ROUND(COALESCE(_product.price, 0), 2);
    _stock_multiplier := 1;
    _variant_label := NULL;

    IF _variant_id IS NOT NULL THEN
      SELECT id, variant_name, variant_value, price, stock_multiplier
      INTO _variant
      FROM public.product_variants
      WHERE id = _variant_id AND product_id = _product_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product variant not found for "%".', _product.name;
      END IF;

      IF _variant.price IS NOT NULL AND _variant.price > 0 THEN
        _unit_price := ROUND(_variant.price, 2);
      END IF;
      _stock_multiplier := COALESCE(_variant.stock_multiplier, 1);
      _variant_label := CONCAT_WS(': ', NULLIF(_variant.variant_name, ''), _variant.variant_value);
    END IF;

    _line_total := ROUND(_unit_price * _qty, 2);
    _subtotal := ROUND(_subtotal + _line_total, 2);

    _prepared_items := _prepared_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', _product_id,
        'product_name', _product.name,
        'variant_id', _variant_id,
        'variant_label', _variant_label,
        'quantity', _qty,
        'unit_price', _unit_price,
        'stock_multiplier', _stock_multiplier,
        'line_total', _line_total
      )
    );
  END LOOP;

  _item_count := jsonb_array_length(_prepared_items);

  -- Discount calculation (Tax is ALWAYS 0)
  _norm_discount_type := CASE WHEN _discount_type = 'percentage' THEN 'percentage' ELSE 'fixed' END;

  IF _discount_value IS NOT NULL AND _discount_value > 0 THEN
    IF _norm_discount_type = 'percentage' THEN
      _norm_discount_value := LEAST(GREATEST(_discount_value, 0), 100);
      _discount_amount := ROUND((_subtotal * _norm_discount_value) / 100.0, 2);
    ELSE
      _norm_discount_value := ROUND(GREATEST(_discount_value, 0), 2);
      _discount_amount := LEAST(_norm_discount_value, _subtotal);
    END IF;
  ELSE
    _norm_discount_value := 0;
    _discount_amount := 0;
  END IF;

  _discount_amount := LEAST(GREATEST(_discount_amount, 0), _subtotal);
  _grand_total := GREATEST(ROUND(_subtotal - _discount_amount, 2), 0);

  -- Payment calculation
  _safe_received := CASE
    WHEN _amount_received IS NOT NULL AND _amount_received > 0 THEN ROUND(_amount_received, 2)
    ELSE 0
  END;

  _change_val := GREATEST(ROUND(_safe_received - _grand_total, 2), 0);
  _due_val := GREATEST(ROUND(_grand_total - _safe_received, 2), 0);
  _paid_val := LEAST(_safe_received, _grand_total);

  IF _due_val = 0 THEN
    _payment_status := 'Paid';
  ELSIF _paid_val > 0 AND _due_val > 0 THEN
    _payment_status := 'Partial';
  ELSE
    _payment_status := 'Unpaid';
  END IF;

  _clean_customer_name := TRIM(COALESCE(_customer_name, ''));
  _clean_customer_mobile := TRIM(COALESCE(_customer_mobile, ''));

  IF _due_val > 0 AND (_clean_customer_name = '' OR LOWER(_clean_customer_name) = 'guest') THEN
    RAISE EXCEPTION 'Customer name is required when there is a due balance.';
  END IF;

  IF _clean_customer_name = '' THEN
    _clean_customer_name := 'Walk-in Customer';
  END IF;

  -- Insert order
  INSERT INTO public.orders (
    subtotal,
    discount_type,
    discount_value,
    discount_amount,
    grand_total,
    total_amount,
    discount,
    tax,
    amount_received,
    paid_amount,
    "change",
    due_amount,
    payment_status,
    payment_method,
    customer_name,
    customer_mobile,
    status
  ) VALUES (
    _subtotal,
    _norm_discount_type,
    _norm_discount_value,
    _discount_amount,
    _grand_total,
    _grand_total,
    _discount_amount,
    0,
    _safe_received,
    _paid_val,
    _change_val,
    _due_val,
    _payment_status,
    COALESCE(NULLIF(TRIM(_payment_method), ''), 'Cash'),
    _clean_customer_name,
    _clean_customer_mobile,
    'Completed'
  )
  RETURNING id, created_at INTO _order_id, _created_at;

  -- Insert order_items, allocate discount shares, deduct FIFO batches & product stock
  _idx := 0;
  FOR _prep IN SELECT * FROM jsonb_array_elements(_prepared_items)
  LOOP
    _idx := _idx + 1;
    _product_id := (_prep->>'product_id')::uuid;
    _variant_id := NULLIF(_prep->>'variant_id', '')::uuid;
    _variant_label := NULLIF(_prep->>'variant_label', '');
    _qty := (_prep->>'quantity')::integer;
    _unit_price := (_prep->>'unit_price')::numeric;
    _stock_multiplier := (_prep->>'stock_multiplier')::numeric;
    _line_total := (_prep->>'line_total')::numeric;

    -- Proportional discount share (last item absorbs any 0.01 rounding remainder)
    IF _subtotal > 0 AND _discount_amount > 0 THEN
      IF _idx = _item_count THEN
        _item_discount_share := GREATEST(0, ROUND(_discount_amount - _allocated_discount_sum, 2));
      ELSE
        _item_discount_share := ROUND((_discount_amount * _line_total) / _subtotal, 2);
        _allocated_discount_sum := ROUND(_allocated_discount_sum + _item_discount_share, 2);
      END IF;
    ELSE
      _item_discount_share := 0;
    END IF;
    _item_net_amount := GREATEST(0, ROUND(_line_total - _item_discount_share, 2));

    -- FIFO Costing
    _qty_to_fulfill := _qty * _stock_multiplier;
    _total_cogs := 0;

    FOR _batch IN
      SELECT id, remaining_quantity, (total_cost / GREATEST(quantity, 1)) AS unit_cost
      FROM public.purchase_orders
      WHERE product_id = _product_id AND remaining_quantity > 0
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN _qty_to_fulfill <= 0;
      IF _batch.remaining_quantity >= _qty_to_fulfill THEN
        UPDATE public.purchase_orders
        SET remaining_quantity = remaining_quantity - _qty_to_fulfill
        WHERE id = _batch.id;
        _total_cogs := _total_cogs + (_qty_to_fulfill * _batch.unit_cost);
        _qty_to_fulfill := 0;
      ELSE
        UPDATE public.purchase_orders
        SET remaining_quantity = 0
        WHERE id = _batch.id;
        _total_cogs := _total_cogs + (_batch.remaining_quantity * _batch.unit_cost);
        _qty_to_fulfill := _qty_to_fulfill - _batch.remaining_quantity;
      END IF;
    END LOOP;

    IF _qty_to_fulfill > 0 THEN
      SELECT COALESCE(cost_price, 0) INTO _fallback_cost
      FROM public.products
      WHERE id = _product_id;
      _total_cogs := _total_cogs + (_qty_to_fulfill * COALESCE(_fallback_cost, 0));
    END IF;

    _final_unit_cost := CASE WHEN _qty > 0 THEN ROUND(_total_cogs / _qty, 2) ELSE 0 END;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      variant_label,
      quantity,
      price,
      unit_cost_price,
      unit_selling_price,
      line_total,
      discount_share,
      net_amount
    ) VALUES (
      _order_id,
      _product_id,
      _variant_id,
      _variant_label,
      _qty,
      _unit_price,
      _final_unit_cost,
      _unit_price,
      _line_total,
      _item_discount_share,
      _item_net_amount
    );

    -- Deduct stock strictly (already locked and verified >= 0)
    UPDATE public.products
    SET stock = stock - (_qty * _stock_multiplier)
    WHERE id = _product_id;
  END LOOP;

  -- Record payment entry
  INSERT INTO public.payments (
    order_id,
    payment_method,
    amount_received,
    paid_amount,
    "change"
  ) VALUES (
    _order_id,
    COALESCE(NULLIF(TRIM(_payment_method), ''), 'Cash'),
    _safe_received,
    _paid_val,
    _change_val
  );

  -- Register customer in public.customers if named customer provided
  IF _clean_customer_name <> '' AND LOWER(_clean_customer_name) NOT IN ('guest', 'walk-in customer') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers
      WHERE LOWER(name) = LOWER(_clean_customer_name)
    ) THEN
      INSERT INTO public.customers (name, mobile)
      VALUES (_clean_customer_name, _clean_customer_mobile);
    ELSIF _clean_customer_mobile <> '' THEN
      UPDATE public.customers
      SET mobile = _clean_customer_mobile
      WHERE LOWER(name) = LOWER(_clean_customer_name) AND (mobile IS NULL OR mobile = '');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', _order_id,
    'created_at', _created_at,
    'subtotal', _subtotal,
    'discount_type', _norm_discount_type,
    'discount_value', _norm_discount_value,
    'discount_amount', _discount_amount,
    'grand_total', _grand_total,
    'amount_received', _safe_received,
    'paid_amount', _paid_val,
    'change', _change_val,
    'due_amount', _due_val,
    'payment_status', _payment_status,
    'payment_method', COALESCE(NULLIF(TRIM(_payment_method), ''), 'Cash'),
    'customer_name', _clean_customer_name,
    'customer_mobile', _clean_customer_mobile,
    'items', _prepared_items
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_sale_tx(jsonb, text, numeric, numeric, text, text, text)
  TO anon, authenticated, service_role;

-- ── 6. Fix get_summary RPC so discounts reduce sales/profit & dues are real ──
CREATE OR REPLACE FUNCTION public.get_summary(_date_from timestamptz, _date_to timestamptz)
RETURNS json AS $$
DECLARE
  _gross_sales numeric := 0;
  _gross_cogs numeric := 0;
  _returns_selling_value numeric := 0;
  _returns_cost_value numeric := 0;
  _net_sales numeric := 0;
  _cogs numeric := 0;
  _gross_profit numeric := 0;
  _total_expenses numeric := 0;
  _net_profit numeric := 0;
  _net_purchases numeric := 0;
  _outstanding_dues numeric := 0;
BEGIN
  -- A1. Gross sales MUST use the saved order grand_total (or total_amount fallback),
  --     so discounts reduce revenue and gross_profit accurately!
  SELECT COALESCE(SUM(
    CASE
      WHEN o.grand_total IS NOT NULL AND (o.grand_total > 0 OR o.subtotal > 0) THEN o.grand_total
      ELSE COALESCE(o.total_amount, 0)
    END
  ), 0)
  INTO _gross_sales
  FROM public.orders o
  WHERE o.created_at >= _date_from
    AND o.created_at <= _date_to
    AND COALESCE(o.status, 'Completed') <> 'Cancelled';

  -- A2. Gross COGS for those orders
  SELECT COALESCE(SUM(oi.unit_cost_price * oi.quantity), 0)
  INTO _gross_cogs
  FROM public.orders o
  JOIN public.order_items oi ON o.id = oi.order_id
  WHERE o.created_at >= _date_from
    AND o.created_at <= _date_to
    AND COALESCE(o.status, 'Completed') <> 'Cancelled';

  -- B1. Returns refund value (uses actual net refund_amount from sales_returns when present,
  --     falling back to net item share from returns table)
  SELECT COALESCE(SUM(sr.refund_amount), 0)
  INTO _returns_selling_value
  FROM public.sales_returns sr
  WHERE sr.created_at >= _date_from AND sr.created_at <= _date_to;

  IF _returns_selling_value = 0 THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN oi.net_amount > 0 AND oi.quantity > 0 THEN (oi.net_amount / oi.quantity) * r.quantity_returned
        ELSE oi.unit_selling_price * r.quantity_returned
      END
    ), 0)
    INTO _returns_selling_value
    FROM public.returns r
    JOIN public.order_items oi ON r.order_item_id = oi.id
    WHERE r.returned_at >= _date_from AND r.returned_at <= _date_to;
  END IF;

  -- B2. Returns cost recovery
  SELECT COALESCE(SUM(oi.unit_cost_price * r.quantity_returned), 0)
  INTO _returns_cost_value
  FROM public.returns r
  JOIN public.order_items oi ON r.order_item_id = oi.id
  WHERE r.returned_at >= _date_from AND r.returned_at <= _date_to;

  -- C. Net Sales, COGS & Gross Profit (gross_profit = net_sales - cogs)
  _net_sales := _gross_sales - _returns_selling_value;
  _cogs := GREATEST(0, _gross_cogs - _returns_cost_value);
  _gross_profit := _net_sales - _cogs;

  -- D. Expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO _total_expenses
  FROM public.expenses
  WHERE expense_date >= (_date_from AT TIME ZONE 'UTC')::date
    AND expense_date <= (_date_to AT TIME ZONE 'UTC')::date;

  _net_profit := _gross_profit - _total_expenses;

  -- E. Purchases
  SELECT COALESCE(SUM(total_cost), 0)
  INTO _net_purchases
  FROM public.purchase_orders
  WHERE created_at >= _date_from AND created_at <= _date_to;

  -- F. Outstanding customer dues across active unpaid/partial orders
  SELECT COALESCE(SUM(o.due_amount), 0)
  INTO _outstanding_dues
  FROM public.orders o
  WHERE COALESCE(o.due_amount, 0) > 0
    AND COALESCE(o.status, 'Completed') NOT IN ('Refunded', 'Cancelled');

  RETURN json_build_object(
    'gross_sales', ROUND(_gross_sales, 2),
    'returns_selling_value', ROUND(_returns_selling_value, 2),
    'returns_cost_value', ROUND(_returns_cost_value, 2),
    'net_sales', ROUND(_net_sales, 2),
    'cogs', ROUND(_cogs, 2),
    'gross_profit', ROUND(_gross_profit, 2),
    'total_expenses', ROUND(_total_expenses, 2),
    'net_profit', ROUND(_net_profit, 2),
    'net_purchases', ROUND(_net_purchases, 2),
    'outstanding_dues', ROUND(_outstanding_dues, 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


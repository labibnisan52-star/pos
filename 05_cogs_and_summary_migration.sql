-- ============================================================
-- COGS, ATOMIC RETURNS, EXPENSES, & SUMMARY MIGRATION
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- ── 1. Add cost tracking to products & order_items ──────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_cost_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_selling_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0;

-- Ensure order_items has a primary key if it doesn't already
-- (Assumes it has an 'id' column of type uuid. If not, it will be added).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='id') THEN
        ALTER TABLE public.order_items ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
    END IF;
END $$;


-- ── 2. Create returns table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  quantity_returned integer NOT NULL CHECK (quantity_returned > 0),
  returned_at timestamptz DEFAULT now(),
  reason text,
  created_by uuid REFERENCES auth.users(id)
);

-- RLS for returns
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_returns" ON public.returns;
CREATE POLICY "allow_all_returns"
  ON public.returns FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.returns TO anon, authenticated, service_role;


-- ── 3. Expenses table (Ensure it exists and matches schema) ──────
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL CHECK (amount > 0),
  category text,
  description text,
  expense_date date DEFAULT current_date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- RLS for expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_expenses_anon" ON public.expenses;
CREATE POLICY "allow_all_expenses_anon"
  ON public.expenses FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.expenses TO anon, authenticated, service_role;


-- ── 4. Atomic create_order RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_order(
  _total_amount numeric,
  _discount numeric,
  _tax numeric,
  _payment_method text,
  _customer_name text,
  _customer_mobile text,
  _items jsonb
) RETURNS uuid AS $$
DECLARE
  _order_id uuid;
  _item jsonb;
  _product_id uuid;
  _qty integer;
  _current_cost numeric;
  _selling_price numeric;
BEGIN
  -- Insert order
  INSERT INTO public.orders (
    total_amount, discount, tax, payment_method, customer_name, customer_mobile, status
  ) VALUES (
    _total_amount, _discount, _tax, _payment_method, _customer_name, _customer_mobile, 'Completed'
  ) RETURNING id INTO _order_id;

  -- Process items
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _product_id := (_item->>'id')::uuid;
    _qty := (_item->>'quantity')::integer;
    _selling_price := (_item->>'price')::numeric;

    -- Get current cost from product
    SELECT cost_price INTO _current_cost FROM public.products WHERE id = _product_id;
    IF _current_cost IS NULL THEN
      _current_cost := 0;
    END IF;

    -- Insert order item
    INSERT INTO public.order_items (
      order_id, product_id, quantity, price, unit_cost_price, unit_selling_price
    ) VALUES (
      _order_id, _product_id, _qty, _selling_price, _current_cost, _selling_price
    );

    -- Decrement stock
    UPDATE public.products 
    SET stock = GREATEST(0, stock - _qty)
    WHERE id = _product_id;
  END LOOP;

  RETURN _order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 5. Atomic process_return RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_return(
  _order_item_id uuid,
  _quantity_returned integer,
  _reason text
) RETURNS void AS $$
DECLARE
  _product_id uuid;
  _original_qty integer;
  _already_returned integer;
BEGIN
  -- Get original qty and product
  SELECT product_id, quantity INTO _product_id, _original_qty
  FROM public.order_items WHERE id = _order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  -- Get sum of existing returns
  SELECT COALESCE(SUM(quantity_returned), 0) INTO _already_returned
  FROM public.returns WHERE order_item_id = _order_item_id;

  -- Validate quantity
  IF (_already_returned + _quantity_returned) > _original_qty THEN
    RAISE EXCEPTION 'Return quantity exceeds original sold quantity';
  END IF;

  -- Insert return record
  INSERT INTO public.returns (order_item_id, quantity_returned, reason, created_by)
  VALUES (_order_item_id, _quantity_returned, _reason, auth.uid());

  -- Restock
  UPDATE public.products
  SET stock = stock + _quantity_returned
  WHERE id = _product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 6. add_expense RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_expense(
  _amount numeric,
  _category text,
  _description text,
  _expense_date date
) RETURNS void AS $$
BEGIN
  INSERT INTO public.expenses (amount, category, description, expense_date, created_by)
  VALUES (_amount, _category, _description, _expense_date, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 7. get_summary RPC ──────────────────────────────────────────
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
  -- A. Sales side
  SELECT 
    COALESCE(SUM(oi.unit_selling_price * oi.quantity), 0),
    COALESCE(SUM(oi.unit_cost_price * oi.quantity), 0)
  INTO _gross_sales, _gross_cogs
  FROM public.orders o
  JOIN public.order_items oi ON o.id = oi.order_id
  WHERE o.created_at >= _date_from AND o.created_at <= _date_to;

  -- B. Returns side (independent of sale date)
  SELECT 
    COALESCE(SUM(oi.unit_selling_price * r.quantity_returned), 0),
    COALESCE(SUM(oi.unit_cost_price * r.quantity_returned), 0)
  INTO _returns_selling_value, _returns_cost_value
  FROM public.returns r
  JOIN public.order_items oi ON r.order_item_id = oi.id
  WHERE r.returned_at >= _date_from AND r.returned_at <= _date_to;

  -- C. Combine
  _net_sales := _gross_sales - _returns_selling_value;
  _cogs := _gross_cogs - _returns_cost_value;
  _gross_profit := _net_sales - _cogs;

  -- Total Expenses
  SELECT COALESCE(SUM(amount), 0) INTO _total_expenses
  FROM public.expenses
  WHERE expense_date >= (_date_from AT TIME ZONE 'UTC')::date 
    AND expense_date <= (_date_to AT TIME ZONE 'UTC')::date;

  -- Net Profit
  _net_profit := _gross_profit - _total_expenses;

  -- Net Purchases
  SELECT COALESCE(SUM(total_cost), 0) INTO _net_purchases
  FROM public.purchase_orders
  WHERE created_at >= _date_from AND created_at <= _date_to;

  RETURN json_build_object(
    'gross_sales', _gross_sales,
    'returns_selling_value', _returns_selling_value,
    'returns_cost_value', _returns_cost_value,
    'net_sales', _net_sales,
    'cogs', _cogs,
    'gross_profit', _gross_profit,
    'total_expenses', _total_expenses,
    'net_profit', _net_profit,
    'net_purchases', _net_purchases,
    'outstanding_dues', _outstanding_dues
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

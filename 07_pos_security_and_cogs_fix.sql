-- ============================================================
-- POS SECURITY AND COGS FIX MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Update create_order to strictly validate cost_price
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
    
    -- STRICT VALIDATION: Require cost_price to be present and greater than zero
    IF _current_cost IS NULL OR _current_cost <= 0 THEN
      RAISE EXCEPTION 'Missing or invalid cost price for product ID %', _product_id;
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


-- 2. Create pos_products view to omit cost_price
CREATE OR REPLACE VIEW public.pos_products AS
SELECT 
  id, 
  name, 
  price, 
  stock, 
  category, 
  barcode, 
  image_color, 
  image_url, 
  unit, 
  product_type, 
  brand, 
  tax_rate, 
  tax_type, 
  description, 
  warranty, 
  created_at
FROM public.products;

-- Ensure authenticated users can read from the view
GRANT SELECT ON public.pos_products TO authenticated, anon;

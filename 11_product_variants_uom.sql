-- ============================================================
-- UOM & VARIANTS ENHANCEMENT
-- ============================================================

-- 1. Add fields to product_variants
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS stock_multiplier numeric NOT NULL DEFAULT 1;

-- 2. Update create_order to handle stock_multiplier and variant_id
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
  _variant_id uuid;
  _qty integer;
  _stock_multiplier numeric;
  
  _qty_to_fulfill numeric;
  _total_cogs numeric;
  _batch record;
  _fallback_cost numeric;
  
  _selling_price numeric;
  _final_unit_cost numeric;
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
    _variant_id := NULLIF(_item->>'variant_id', '')::uuid;
    _qty := (_item->>'quantity')::integer;
    _selling_price := (_item->>'price')::numeric;
    _stock_multiplier := COALESCE((_item->>'stock_multiplier')::numeric, 1);
    
    _qty_to_fulfill := _qty * _stock_multiplier;
    _total_cogs := 0;

    -- FIFO Loop over available batches in purchase_orders
    FOR _batch IN 
      SELECT id, remaining_quantity, (total_cost / quantity) as unit_cost 
      FROM public.purchase_orders 
      WHERE product_id = _product_id AND remaining_quantity > 0 
      ORDER BY created_at ASC
    LOOP
      IF _qty_to_fulfill <= 0 THEN
        EXIT;
      END IF;

      IF _batch.remaining_quantity >= _qty_to_fulfill THEN
        -- Deduct from this batch
        UPDATE public.purchase_orders 
        SET remaining_quantity = remaining_quantity - _qty_to_fulfill 
        WHERE id = _batch.id;
        
        _total_cogs := _total_cogs + (_qty_to_fulfill * _batch.unit_cost);
        _qty_to_fulfill := 0;
      ELSE
        -- Take all remaining from this batch
        UPDATE public.purchase_orders 
        SET remaining_quantity = 0 
        WHERE id = _batch.id;
        
        _total_cogs := _total_cogs + (_batch.remaining_quantity * _batch.unit_cost);
        _qty_to_fulfill := _qty_to_fulfill - _batch.remaining_quantity;
      END IF;
    END LOOP;

    -- If we still need to fulfill but ran out of FIFO batches, use base product cost_price
    IF _qty_to_fulfill > 0 THEN
      SELECT cost_price INTO _fallback_cost FROM public.products WHERE id = _product_id;
      _fallback_cost := COALESCE(_fallback_cost, 0);
      _total_cogs := _total_cogs + (_qty_to_fulfill * _fallback_cost);
    END IF;
    
    -- Calculate final blended unit cost price for the order item
    IF _qty > 0 THEN
      _final_unit_cost := _total_cogs / _qty;
    ELSE
      _final_unit_cost := 0;
    END IF;

    -- Insert order item
    -- Note: order_items doesn't have variant_id in the original schema, but we'll record the precise selling price and cost.
    -- Optionally we could alter order_items to add variant_id, but skipping to avoid breaking changes.
    INSERT INTO public.order_items (
      order_id, product_id, quantity, price, unit_cost_price, unit_selling_price
    ) VALUES (
      _order_id, _product_id, _qty, _selling_price, _final_unit_cost, _selling_price
    );

    -- Decrement global stock in products table by the total base units consumed
    UPDATE public.products 
    SET stock = GREATEST(0, stock - (_qty * _stock_multiplier))
    WHERE id = _product_id;
  END LOOP;

  RETURN _order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

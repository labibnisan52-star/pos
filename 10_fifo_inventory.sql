-- ============================================================
-- FIFO INVENTORY COSTING MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add remaining_quantity to purchase_orders
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS remaining_quantity integer NOT NULL DEFAULT 0;

-- Backfill: Assume existing purchase orders are exhausted to prevent old costs from skewing current margins.
-- FIFO will apply cleanly to all NEW purchase orders added after running this.
UPDATE public.purchase_orders SET remaining_quantity = 0;

-- 2. Update create_order to use FIFO costing
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
  
  _qty_to_fulfill integer;
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
    _qty := (_item->>'quantity')::integer;
    _selling_price := (_item->>'price')::numeric;
    
    _qty_to_fulfill := _qty;
    _total_cogs := 0;

    -- FIFO Loop over available batches in purchase_orders
    FOR _batch IN 
      SELECT id, remaining_quantity, (total_cost / quantity) as unit_cost 
      FROM public.purchase_orders 
      WHERE product_id = _product_id AND remaining_quantity > 0 
      ORDER BY created_at ASC
    LOOP
      IF _qty_to_fulfill <= 0 THEN
        EXIT; -- Finished fulfilling this item
      END IF;
      
      IF _batch.remaining_quantity >= _qty_to_fulfill THEN
        -- This batch can fulfill the rest
        UPDATE public.purchase_orders 
        SET remaining_quantity = remaining_quantity - _qty_to_fulfill 
        WHERE id = _batch.id;
        
        _total_cogs := _total_cogs + (_qty_to_fulfill * _batch.unit_cost);
        _qty_to_fulfill := 0;
      ELSE
        -- Exhaust this batch entirely
        UPDATE public.purchase_orders 
        SET remaining_quantity = 0 
        WHERE id = _batch.id;
        
        _total_cogs := _total_cogs + (_batch.remaining_quantity * _batch.unit_cost);
        _qty_to_fulfill := _qty_to_fulfill - _batch.remaining_quantity;
      END IF;
    END LOOP;
    
    -- Fallback for any unfulfilled quantity (e.g. from old stock before POs were tracked)
    IF _qty_to_fulfill > 0 THEN
      SELECT cost_price INTO _fallback_cost FROM public.products WHERE id = _product_id;
      
      -- We'll allow fallback cost to be 0 or null just to prevent hard crashes if old data is weird, 
      -- but we'll try to use it if available.
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
    INSERT INTO public.order_items (
      order_id, product_id, quantity, price, unit_cost_price, unit_selling_price
    ) VALUES (
      _order_id, _product_id, _qty, _selling_price, _final_unit_cost, _selling_price
    );

    -- Decrement global stock in products table
    UPDATE public.products 
    SET stock = GREATEST(0, stock - _qty)
    WHERE id = _product_id;
  END LOOP;

  RETURN _order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

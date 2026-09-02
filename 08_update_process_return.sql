-- ============================================================
-- UPDATE process_return RPC to handle restock option
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_return(
  _order_item_id uuid,
  _quantity_returned integer,
  _reason text,
  _restock boolean DEFAULT true
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

  -- Conditionally Restock
  IF _restock THEN
    UPDATE public.products
    SET stock = stock + _quantity_returned
    WHERE id = _product_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

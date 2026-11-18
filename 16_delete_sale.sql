-- ============================================================================
-- 16_delete_sale.sql
-- Atomic sale deletion RPC: restores product stock (excluding already-returned
-- quantities), cleans up returns/due_payments/order_items, and deletes the order
-- so revenue, COGS, profit, and dues stay consistent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_pos_sale(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _item RECORD;
  _returned_qty numeric;
  _stock_multiplier numeric;
  _restore_qty numeric;
  _restored_count integer := 0;
BEGIN
  SELECT * INTO _order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', _order_id;
  END IF;

  -- Restore stock for each item (skipping quantities already returned)
  FOR _item IN
    SELECT id, product_id, variant_id, quantity
    FROM public.order_items
    WHERE order_id = _order_id
  LOOP
    SELECT COALESCE(SUM(sr.quantity), 0) INTO _returned_qty
    FROM public.sales_returns sr
    WHERE sr.order_item_id = _item.id;

    _stock_multiplier := 1;
    IF _item.variant_id IS NOT NULL THEN
      SELECT COALESCE(pv.stock_multiplier, 1) INTO _stock_multiplier
      FROM public.product_variants pv
      WHERE pv.id = _item.variant_id;
      IF NOT FOUND THEN
        _stock_multiplier := 1;
      END IF;
    END IF;

    _restore_qty := GREATEST(0, COALESCE(_item.quantity, 0) - COALESCE(_returned_qty, 0)) * _stock_multiplier;

    IF _restore_qty > 0 AND _item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock = stock + _restore_qty
      WHERE id = _item.product_id;
      _restored_count := _restored_count + 1;
    END IF;
  END LOOP;

  -- Delete dependent records and the order itself
  DELETE FROM public.sales_returns WHERE order_id = _order_id;
  DELETE FROM public.due_payments WHERE order_id = _order_id;
  DELETE FROM public.order_items WHERE order_id = _order_id;
  DELETE FROM public.orders WHERE id = _order_id;

  RETURN jsonb_build_object(
    'deleted_order_id', _order_id,
    'restored_items', _restored_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_pos_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pos_sale(uuid) TO service_role;

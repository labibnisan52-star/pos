-- ============================================================================
-- 13_due_payments.sql
-- RPC for Atomic Due Payments (Partial Due & Full Settlement)
-- Run this in Supabase SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_due_payment(
  _order_id uuid,
  _amount numeric,
  _payment_method text DEFAULT 'Cash',
  _notes text DEFAULT ''
) RETURNS jsonb AS $$
DECLARE
  _order record;
  _current_due numeric;
  _current_paid numeric;
  _current_received numeric;
  _paid_towards_due numeric;
  _change_to_return numeric;
  _new_due numeric;
  _new_paid numeric;
  _new_received numeric;
  _new_status text;
BEGIN
  -- 1. Fetch order with row-level lock
  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found with ID %', _order_id;
  END IF;

  _current_due := COALESCE(_order.due_amount, 0);
  IF _current_due <= 0 THEN
    RAISE EXCEPTION 'This order has no outstanding due. It is already fully paid.';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0.';
  END IF;

  -- 2. Calculations
  _paid_towards_due := ROUND(LEAST(_amount, _current_due), 2);
  _change_to_return := ROUND(GREATEST(0, _amount - _current_due), 2);
  _new_due := ROUND(GREATEST(0, _current_due - _paid_towards_due), 2);
  _current_paid := COALESCE(_order.paid_amount, 0);
  _new_paid := ROUND(_current_paid + _paid_towards_due, 2);
  _current_received := COALESCE(_order.amount_received, 0);
  _new_received := ROUND(_current_received + _amount, 2);
  _new_status := CASE WHEN _new_due <= 0 THEN 'Paid' ELSE 'Partial' END;

  -- 3. Insert payment record into payments table
  INSERT INTO public.payments (
    order_id,
    payment_method,
    amount_received,
    paid_amount,
    "change"
  ) VALUES (
    _order.id,
    COALESCE(NULLIF(TRIM(_payment_method), ''), 'Cash'),
    _amount,
    _paid_towards_due,
    _change_to_return
  );

  -- 4. Update order with new balances and payment status
  UPDATE public.orders
  SET paid_amount = _new_paid,
      amount_received = _new_received,
      due_amount = _new_due,
      payment_status = _new_status
  WHERE id = _order.id;

  RETURN jsonb_build_object(
    'order_id', _order.id,
    'amount_paid', _paid_towards_due,
    'change', _change_to_return,
    'new_due', _new_due,
    'new_paid', _new_paid,
    'new_status', _new_status,
    'payment_method', _payment_method
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.record_due_payment(uuid, numeric, text, text)
  TO anon, authenticated, service_role;

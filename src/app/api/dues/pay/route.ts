import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import { roundMoney } from "@/lib/calculations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = String(body.order_id || "").trim();
    const paymentMethod = String(body.payment_method || "Cash").trim();
    const amountReceived = Number(body.amount) || 0;
    const notes = String(body.notes || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required." },
        { status: 400 }
      );
    }

    if (amountReceived <= 0 || isNaN(amountReceived)) {
      return NextResponse.json(
        { error: "Payment amount must be greater than ৳0." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch authoritative order data from DB
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: `Order not found: ${orderError?.message || orderId}` },
        { status: 404 }
      );
    }

    if (order.status === "Cancelled" || order.status === "Refunded") {
      return NextResponse.json(
        { error: `Cannot collect due for a ${order.status.toLowerCase()} order.` },
        { status: 400 }
      );
    }

    const currentDue = roundMoney(Number(order.due_amount) || 0);
    if (currentDue <= 0) {
      return NextResponse.json(
        { error: "This order has no outstanding due. It is already fully paid." },
        { status: 400 }
      );
    }

    // Money calculations (integer paisa safe via roundMoney)
    const paidTowardsDue = roundMoney(Math.min(amountReceived, currentDue));
    const changeToReturn = roundMoney(Math.max(0, amountReceived - currentDue));
    const newRemainingDue = roundMoney(Math.max(0, currentDue - paidTowardsDue));
    const currentPaid = roundMoney(Number(order.paid_amount) || 0);
    const newPaidAmount = roundMoney(currentPaid + paidTowardsDue);
    const currentReceived = roundMoney(Number(order.amount_received) || 0);
    const newAmountReceived = roundMoney(currentReceived + amountReceived);
    const newPaymentStatus = newRemainingDue <= 0 ? "Paid" : "Partial";

    // 2. Insert payment record into public.payments
    const { error: paymentError } = await supabase.from("payments").insert([
      {
        order_id: order.id,
        payment_method: paymentMethod,
        amount_received: amountReceived,
        paid_amount: paidTowardsDue,
        change: changeToReturn,
      },
    ]);

    if (paymentError) {
      console.warn("Notice: public.payments insert:", paymentError.message);
    }

    // 3. Update orders table with new payment breakdown
    const { data: updatedOrder, error: updateOrderError } = await supabase
      .from("orders")
      .update({
        paid_amount: newPaidAmount,
        amount_received: newAmountReceived,
        due_amount: newRemainingDue,
        payment_status: newPaymentStatus,
      })
      .eq("id", order.id)
      .select()
      .single();

    if (updateOrderError) {
      return NextResponse.json(
        { error: `Failed to update order due balance: ${updateOrderError.message}` },
        { status: 500 }
      );
    }

    // Format items for ReceiptModal compatibility
    const rawItems = order.order_items || [];
    const receiptItems = rawItems.map((it: any) => ({
      name: it.product_name || it.name || "Product Item",
      variant_label: it.variant_label || null,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_selling_price || it.unit_price) || 0,
      line_total: Number(it.line_total || it.total_price) || 0,
    }));

    const receiptOrder = {
      id: updatedOrder.id,
      created_at: updatedOrder.created_at,
      customer_name: updatedOrder.customer_name || "Customer",
      customer_mobile: updatedOrder.customer_mobile || "",
      payment_method: paymentMethod,
      subtotal: Number(updatedOrder.subtotal) || 0,
      discount_type: updatedOrder.discount_type || "fixed",
      discount_value: Number(updatedOrder.discount_value) || 0,
      discount_amount: Number(updatedOrder.discount_amount) || 0,
      grand_total:
        Number(updatedOrder.grand_total) || Number(updatedOrder.total_amount) || 0,
      amount_received: newAmountReceived,
      paid_amount: newPaidAmount,
      change: changeToReturn,
      due_amount: newRemainingDue,
      payment_status: newPaymentStatus,
      items: receiptItems,
    };

    return NextResponse.json(
      {
        success: true,
        order: receiptOrder,
        payment: {
          amount_paid: paidTowardsDue,
          amount_received: amountReceived,
          change: changeToReturn,
          remaining_due: newRemainingDue,
          method: paymentMethod,
          notes: notes,
          paid_at: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

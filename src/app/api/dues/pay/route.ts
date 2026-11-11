import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import { roundMoney } from "@/lib/calculations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
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

    // 1. Fetch order directly without embedded joins (avoids PGRST200 schema cache error)
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: `Order not found (${orderId}): ${orderError?.message || ""}` },
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
    const currentPaid = roundMoney(Number(order.paid_amount || order.amount_received) || 0);
    const newPaidAmount = roundMoney(currentPaid + paidTowardsDue);
    const currentReceived = roundMoney(Number(order.amount_received) || 0);
    const newAmountReceived = roundMoney(currentReceived + amountReceived);
    const newPaymentStatus = newRemainingDue <= 0 ? "Paid" : "Partial";

    // 2. Try atomic Postgres RPC first (SECURITY DEFINER)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "record_due_payment",
      {
        _order_id: order.id,
        _amount: amountReceived,
        _payment_method: paymentMethod,
        _notes: notes,
      }
    );

    let finalDue = newRemainingDue;
    let finalPaid = newPaidAmount;
    let finalReceived = newAmountReceived;
    let finalStatus = newPaymentStatus;

    if (rpcError) {
      // Fallback: direct table updates
      console.warn("RPC record_due_payment not found or failed, falling back to direct table update:", rpcError.message);

      // A. Insert payment record
      await supabase.from("payments").insert([
        {
          order_id: order.id,
          payment_method: paymentMethod,
          amount_received: amountReceived,
          paid_amount: paidTowardsDue,
          change: changeToReturn,
        },
      ]);

      // B. Update order
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

      if (updatedOrder) {
        finalDue = Number(updatedOrder.due_amount) || newRemainingDue;
        finalPaid = Number(updatedOrder.paid_amount) || newPaidAmount;
        finalReceived = Number(updatedOrder.amount_received) || newAmountReceived;
        finalStatus = updatedOrder.payment_status || newPaymentStatus;
      }
    } else if (rpcData) {
      finalDue = Number(rpcData.new_due) || 0;
      finalPaid = Number(rpcData.new_paid) || newPaidAmount;
      finalStatus = rpcData.new_status || newPaymentStatus;
    }

    // 3. Fetch order items safely in a separate query (never joins embedded)
    let receiptItems: any[] = [];
    try {
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order.id);

      if (itemsData && itemsData.length > 0) {
        receiptItems = itemsData.map((it: any) => ({
          name: it.product_name || it.name || "Product Item",
          variant_label: it.variant_label || null,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_selling_price || it.unit_price) || 0,
          line_total: Number(it.line_total || it.total_price) || 0,
        }));
      }
    } catch {
      // Non-fatal if order_items query fails
    }

    const receiptOrder = {
      id: order.id,
      created_at: order.created_at,
      customer_name: order.customer_name || "Customer",
      customer_mobile: order.customer_mobile || "",
      payment_method: paymentMethod,
      subtotal: Number(order.subtotal) || 0,
      discount_type: order.discount_type || "fixed",
      discount_value: Number(order.discount_value) || 0,
      discount_amount: Number(order.discount_amount) || 0,
      grand_total:
        Number(order.grand_total) || Number(order.total_amount) || 0,
      amount_received: finalReceived,
      paid_amount: finalPaid,
      change: changeToReturn,
      due_amount: finalDue,
      payment_status: finalStatus,
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
          remaining_due: finalDue,
          method: paymentMethod,
          notes: notes,
          paid_at: new Date().toISOString(),
          is_partial: finalDue > 0,
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

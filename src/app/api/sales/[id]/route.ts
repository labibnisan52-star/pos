import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = String(id || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Try atomic Postgres RPC first (SECURITY DEFINER)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "delete_pos_sale",
      { _order_id: orderId }
    );

    if (!rpcError && rpcData) {
      return NextResponse.json(
        {
          success: true,
          deletedOrderId: orderId,
          restoredItems:
            typeof rpcData.restored_items === "number"
              ? rpcData.restored_items
              : undefined,
        },
        { status: 200 }
      );
    }

    // If the RPC ran and explicitly reported "Order not found", return 404
    if (rpcError && rpcError.message.includes("Order not found")) {
      return NextResponse.json(
        { error: "Sale order not found." },
        { status: 404 }
      );
    }

    // 2. Fallback: direct Supabase cleanup when delete_pos_sale RPC is not yet applied
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Sale order not found." },
        { status: 404 }
      );
    }

    const { data: orderItems, error: itemsError } = await supabase
      .from("order_items")
      .select("id, product_id, variant_id, quantity")
      .eq("order_id", orderId);

    if (itemsError) {
      return NextResponse.json(
        { error: `Failed to load order items: ${itemsError.message}` },
        { status: 500 }
      );
    }

    const items = orderItems || [];

    // Fetch already-returned quantities for this order so we don't double-restore stock
    const returnedByItem = new Map<string, number>();
    const { data: returnsData } = await supabase
      .from("sales_returns")
      .select("order_item_id, quantity")
      .eq("order_id", orderId);

    for (const r of returnsData || []) {
      const key = String(r.order_item_id || "");
      if (key) {
        returnedByItem.set(
          key,
          (returnedByItem.get(key) || 0) + (Number(r.quantity) || 0)
        );
      }
    }

    // Fetch variant stock multipliers if any items used variants
    const variantIds = Array.from(
      new Set(
        items
          .map((it) => (it.variant_id ? String(it.variant_id) : ""))
          .filter(Boolean)
      )
    );
    const multiplierMap = new Map<string, number>();
    if (variantIds.length > 0) {
      const { data: variantsData } = await supabase
        .from("product_variants")
        .select("id, stock_multiplier")
        .in("id", variantIds);
      for (const v of variantsData || []) {
        multiplierMap.set(String(v.id), Number(v.stock_multiplier) || 1);
      }
    }

    // Aggregate stock to restore per product_id
    const stockDeltaByProduct = new Map<string, number>();
    for (const item of items) {
      if (!item.product_id) continue;
      const alreadyReturned = returnedByItem.get(String(item.id)) || 0;
      const netSoldQty = Math.max(0, (Number(item.quantity) || 0) - alreadyReturned);
      const multiplier = item.variant_id
        ? multiplierMap.get(String(item.variant_id)) || 1
        : 1;
      const restoreQty = netSoldQty * multiplier;
      if (restoreQty > 0) {
        const pid = String(item.product_id);
        stockDeltaByProduct.set(pid, (stockDeltaByProduct.get(pid) || 0) + restoreQty);
      }
    }

    if (stockDeltaByProduct.size > 0) {
      const productIds = Array.from(stockDeltaByProduct.keys());
      const { data: productsData, error: prodFetchErr } = await supabase
        .from("products")
        .select("id, stock")
        .in("id", productIds);

      if (prodFetchErr) {
        return NextResponse.json(
          { error: `Failed to fetch products for stock restore: ${prodFetchErr.message}` },
          { status: 500 }
        );
      }

      for (const prod of productsData || []) {
        const delta = stockDeltaByProduct.get(String(prod.id)) || 0;
        if (delta > 0) {
          const nextStock = (Number(prod.stock) || 0) + delta;
          const { error: stockUpdateErr } = await supabase
            .from("products")
            .update({ stock: nextStock })
            .eq("id", prod.id);
          if (stockUpdateErr) {
            return NextResponse.json(
              { error: `Failed to restore product stock: ${stockUpdateErr.message}` },
              { status: 500 }
            );
          }
        }
      }
    }

    // Delete dependent records and finally the order
    await supabase.from("sales_returns").delete().eq("order_id", orderId);
    await supabase.from("due_payments").delete().eq("order_id", orderId);
    await supabase.from("order_items").delete().eq("order_id", orderId);

    const { error: deleteOrderErr } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (deleteOrderErr) {
      return NextResponse.json(
        { error: `Failed to delete sale order: ${deleteOrderErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        deletedOrderId: orderId,
        restoredItems: stockDeltaByProduct.size,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

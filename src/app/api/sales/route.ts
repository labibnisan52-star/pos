import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import {
  calculateCartTotals,
  DiscountType,
  parseNumericInput,
  validateSaleInput,
} from "@/lib/calculations";

interface IncomingSaleItem {
  id: string;
  variant_id?: string | null;
  quantity: number | string;
}

interface IncomingSaleBody {
  items: IncomingSaleItem[];
  discountType?: DiscountType | string;
  discountValue?: number | string | null;
  amountReceived?: number | string | null;
  paymentMethod?: string;
  customerName?: string;
  customerMobile?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IncomingSaleBody;
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty. Add at least one product to complete the sale." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Fetch authoritative products & variants from DB — NEVER trust client prices/totals
    const productIds = Array.from(
      new Set(rawItems.map((it) => String(it.id || "").trim()).filter(Boolean))
    );
    const variantIds = Array.from(
      new Set(
        rawItems
          .map((it) => (it.variant_id ? String(it.variant_id).trim() : ""))
          .filter(Boolean)
      )
    );

    const { data: dbProducts, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, cost_price, stock")
      .in("id", productIds);

    if (productsError) {
      return NextResponse.json(
        { error: `Failed to verify products: ${productsError.message}` },
        { status: 500 }
      );
    }

    const productMap = new Map(
      (dbProducts || []).map((p) => [String(p.id), p])
    );

    const variantMap = new Map<
      string,
      {
        id: string;
        product_id: string;
        variant_name: string;
        variant_value: string;
        price: number | null;
        stock_multiplier: number | null;
      }
    >();

    if (variantIds.length > 0) {
      const { data: dbVariants, error: variantsError } = await supabase
        .from("product_variants")
        .select("id, product_id, variant_name, variant_value, price, stock_multiplier")
        .in("id", variantIds);

      if (variantsError) {
        return NextResponse.json(
          { error: `Failed to verify product variants: ${variantsError.message}` },
          { status: 500 }
        );
      }

      for (const v of dbVariants || []) {
        variantMap.set(String(v.id), v);
      }
    }

    // Build authoritative validation & calculation inputs
    const resolvedItems: Array<{
      id: string;
      variant_id: string | null;
      variant_label: string | null;
      name: string;
      unitPrice: number;
      costPrice: number;
      quantity: number | string;
      availableStock: number;
      stockMultiplier: number;
    }> = [];

    for (const raw of rawItems) {
      const pid = String(raw.id || "").trim();
      const product = productMap.get(pid);
      if (!product) {
        return NextResponse.json(
          { error: `Product not found in inventory (${pid}).` },
          { status: 400 }
        );
      }

      let unitPrice = Number(product.price) || 0;
      let stockMultiplier = 1;
      let variantId: string | null = null;
      let variantLabel: string | null = null;

      if (raw.variant_id) {
        const vid = String(raw.variant_id).trim();
        const variant = variantMap.get(vid);
        if (!variant || String(variant.product_id) !== pid) {
          return NextResponse.json(
            { error: `Selected variant is invalid for "${product.name}".` },
            { status: 400 }
          );
        }
        variantId = vid;
        if (variant.price !== null && Number(variant.price) > 0) {
          unitPrice = Number(variant.price);
        }
        if (variant.stock_multiplier && Number(variant.stock_multiplier) > 0) {
          stockMultiplier = Number(variant.stock_multiplier);
        }
        variantLabel = variant.variant_name
          ? `${variant.variant_name}: ${variant.variant_value}`
          : variant.variant_value;
      }

      resolvedItems.push({
        id: pid,
        variant_id: variantId,
        variant_label: variantLabel,
        name: variantLabel ? `${product.name} (${variantLabel})` : product.name,
        unitPrice,
        costPrice: Number(product.cost_price) || 0,
        quantity: raw.quantity,
        availableStock: Number(product.stock) || 0,
        stockMultiplier,
      });
    }

    const discountType: DiscountType =
      body.discountType === "percentage" ? "percentage" : "fixed";

    // Server-side validation using shared pure utility
    const validation = validateSaleInput({
      items: resolvedItems.map((it) => ({
        id: it.id,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        availableStock: it.availableStock,
        stockMultiplier: it.stockMultiplier,
      })),
      discountType,
      discountRaw: body.discountValue,
      amountReceivedRaw: body.amountReceived,
      customerName: body.customerName,
      customerMobile: body.customerMobile,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors[0], errors: validation.errors },
        { status: 400 }
      );
    }

    // Authoritative server calculation via shared calculateCartTotals()
    const serverTotals = calculateCartTotals({
      items: resolvedItems.map((it) => ({
        id: it.id,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        costPrice: it.costPrice,
      })),
      discountType,
      discountValue: body.discountValue,
      amountReceived: body.amountReceived,
    });

    const parsedReceived = parseNumericInput(body.amountReceived);
    const safeReceived =
      parsedReceived.isValid && !parsedReceived.isEmpty && parsedReceived.value > 0
        ? serverTotals.amountReceived
        : 0;

    const rpcItems = resolvedItems.map((it, idx) => ({
      id: it.id,
      variant_id: it.variant_id || "",
      quantity: serverTotals.items[idx].quantity,
    }));

    const paymentMethod = ["Cash", "Card", "Mobile"].includes(
      String(body.paymentMethod || "")
    )
      ? String(body.paymentMethod)
      : "Cash";

    // Execute order + order_items + payment + FIFO + stock deduction in ONE atomic DB transaction
    const { data: txData, error: txError } = await supabase.rpc(
      "complete_sale_tx",
      {
        _items: rpcItems,
        _discount_type: serverTotals.discountType,
        _discount_value: serverTotals.discountValue,
        _amount_received: safeReceived,
        _payment_method: paymentMethod,
        _customer_name: (body.customerName || "").trim(),
        _customer_mobile: (body.customerMobile || "").trim(),
      }
    );

    if (txError) {
      const msg = txError.message || "Failed to complete sale transaction.";
      if (msg.includes("complete_sale_tx")) {
        return NextResponse.json(
          {
            error:
              "Database migration required: please run 12_pos_overhaul.sql in your Supabase SQL Editor to enable single-step atomic sales.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const receiptOrder = {
      id: String(txData?.id || ""),
      created_at: String(txData?.created_at || new Date().toISOString()),
      customer_name:
        String(txData?.customer_name || (body.customerName || "").trim()) ||
        "Walk-in Customer",
      customer_mobile: String(
        txData?.customer_mobile ?? (body.customerMobile || "").trim()
      ),
      payment_method: paymentMethod,
      subtotal: serverTotals.subtotal,
      discount_type: serverTotals.discountType,
      discount_value: serverTotals.discountValue,
      discount_amount: serverTotals.discountAmount,
      grand_total: serverTotals.grandTotal,
      amount_received: serverTotals.amountReceived,
      paid_amount: serverTotals.paidAmount,
      change: serverTotals.changeToReturn,
      due_amount: serverTotals.dueAmount,
      payment_status: serverTotals.paymentStatus,
      items: resolvedItems.map((it, idx) => ({
        name: productMap.get(it.id)?.name || it.name,
        variant_label: it.variant_label,
        quantity: serverTotals.items[idx].quantity,
        unit_price: serverTotals.items[idx].unitPrice,
        line_total: serverTotals.items[idx].lineTotal,
      })),
    };

    return NextResponse.json({ order: receiptOrder }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


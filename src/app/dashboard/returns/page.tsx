"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Calendar,
  User,
  CheckSquare,
  Square,
  Plus,
  Minus,
  RotateCcw,
  Check,
  Banknote,
  CreditCard,
  Smartphone,
  Package,
  AlertCircle,
  Receipt,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  calculateReturnTotals,
  formatBDT,
} from "@/lib/calculations";

type OrderInfo = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  subtotal?: number;
  discount?: number;
  discount_amount?: number;
  grand_total?: number;
  total_amount: number;
  paid_amount?: number;
  payment_method: string;
  status: string;
};

type ReturnItem = {
  order_item_id: string;
  product_id: string;
  product_name: string;
  variant_label?: string | null;
  image_url?: string;
  image_color?: string;
  original_qty: number;
  return_qty: number;
  unit_price: number;
  selected: boolean;
};

type RefundMethod = "Cash" | "Card" | "Mobile";

const RETURN_REASONS = [
  "Wrong Size / Fit Issue",
  "Damaged / Defective",
  "Wrong Shoe / Color",
  "Customer Changed Mind",
  "Exchange / Other",
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const shortId = (id: string) =>
  "#ORD-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

export default function SalesReturnPage() {
  const supabase = useMemo(() => createClient(), []);

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Found order
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);

  // Form
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("Cash");
  const [restockingFeeInput, setRestockingFeeInput] = useState("");

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [savedRefundAmount, setSavedRefundAmount] = useState(0);
  const [restockAll, setRestockAll] = useState(true);

  const handleFindOrder = useCallback(async () => {
    const raw = searchInput.trim();
    if (!raw) return;
    setSearching(true);
    setSearchError("");
    setOrder(null);
    setItems([]);
    setSuccess(false);

    try {
      const cleanedId = raw
        .replace(/^#/, "")
        .replace(/^ORD[-\s]*/i, "")
        .replace(/[-\s]/g, "")
        .toUpperCase();

      let orderData: OrderInfo | null = null;

      // 1. Search by customer mobile
      const { data: byMobile } = await supabase
        .from("orders")
        .select("*")
        .ilike("customer_mobile", `%${raw}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byMobile && (byMobile.total_amount > 0 || byMobile.grand_total > 0)) {
        orderData = byMobile as OrderInfo;
      } else {
        // 2. Search by customer name
        const { data: byName } = await supabase
          .from("orders")
          .select("*")
          .ilike("customer_name", `%${raw}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byName && (byName.total_amount > 0 || byName.grand_total > 0)) {
          orderData = byName as OrderInfo;
        } else {
          // 3. Match by UUID fragment
          const { data: allOrders } = await supabase
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(300);

          if (allOrders && cleanedId.length >= 4) {
            const found = allOrders.find((o) =>
              String(o.id).replace(/-/g, "").toUpperCase().includes(cleanedId)
            );
            orderData = (found as OrderInfo) ?? null;
          }
        }
      }

      if (orderData && orderData.status === "Refunded") {
        setSearchError("This order has already been refunded.");
        setSearching(false);
        return;
      }

      if (!orderData) {
        setSearchError(
          "No matching order found. Enter the Receipt/Order ID, customer name, or phone number."
        );
        setSearching(false);
        return;
      }

      setOrder(orderData);

      const { data: orderItems } = await supabase
        .from("order_items")
        .select(
          `
          id,
          product_id,
          variant_label,
          quantity,
          price,
          products ( name, image_url, image_color )
        `
        )
        .eq("order_id", orderData.id);

      if (orderItems) {
        setItems(
          orderItems.map((oi: Record<string, unknown>) => {
            const prod = oi.products as
              | { name?: string; image_url?: string; image_color?: string }
              | null;
            return {
              order_item_id: String(oi.id),
              product_id: String(oi.product_id || ""),
              product_name: prod?.name ?? "Product",
              variant_label: oi.variant_label ? String(oi.variant_label) : null,
              image_url: prod?.image_url,
              image_color: prod?.image_color ?? "bg-gray-100",
              original_qty: Number(oi.quantity) || 1,
              return_qty: Number(oi.quantity) || 1,
              unit_price: Number(oi.price) || 0,
              selected: true,
            };
          })
        );
      }
    } catch {
      setSearchError("Failed to look up order. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [searchInput, supabase]);

  const toggleItem = (idx: number) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, selected: !it.selected } : it))
    );

  const changeQty = (idx: number, delta: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const newQty = Math.max(
          1,
          Math.min(it.original_qty, it.return_qty + delta)
        );
        return { ...it, return_qty: newQty };
      })
    );

  // Shared Equation 9 calculation: item_discount_share & item_net_amount
  // Ensures customer never receives back more than they actually paid after discount!
  const returnCalc = useMemo(() => {
    const orderGrandTotal =
      order?.grand_total !== undefined && order.grand_total !== null
        ? order.grand_total
        : order?.total_amount;
    const orderDiscount =
      order?.discount_amount !== undefined && order.discount_amount !== null
        ? order.discount_amount
        : order?.discount;
    const paidCap =
      order?.paid_amount !== undefined &&
      order.paid_amount !== null &&
      order.paid_amount > 0
        ? order.paid_amount
        : undefined;

    return calculateReturnTotals({
      items: items.map((it) => ({
        orderItemId: it.order_item_id,
        unitPrice: it.unit_price,
        originalQty: it.original_qty,
        returnQty: it.return_qty,
        selected: it.selected,
      })),
      orderDiscountAmount: orderDiscount,
      orderGrandTotal,
      orderPaidAmount: paidCap,
      restockingFee: restockingFeeInput,
    });
  }, [items, order, restockingFeeInput]);

  const selectedItems = items.filter((it) => it.selected);

  const handleConfirm = async () => {
    if (!order || selectedItems.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      const finalRefund = returnCalc.totalRefund;

      await supabase.from("sales_returns").insert([
        {
          order_id: order.id,
          customer_name: order.customer_name || "Walk-in Customer",
          customer_mobile: order.customer_mobile || "",
          refund_amount: finalRefund,
          refund_method: refundMethod,
          reason,
          notes,
          restocked: restockAll,
          item_count: selectedItems.reduce((s, it) => s + it.return_qty, 0),
        },
      ]);

      await supabase
        .from("orders")
        .update({ status: "Refunded" })
        .eq("id", order.id);

      for (const item of selectedItems) {
        const { error: rpcError } = await supabase.rpc("process_return", {
          _order_item_id: item.order_item_id,
          _quantity_returned: item.return_qty,
          _reason: reason,
          _restock: restockAll,
        });
        if (rpcError) {
          console.error(
            "Failed to process return for item",
            item.order_item_id,
            rpcError
          );
        }
      }

      setSavedRefundAmount(finalRefund);
      setSuccess(true);
    } catch (err) {
      console.error("Return failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setOrder(null);
    setItems([]);
    setSearchInput("");
    setSearchError("");
    setSuccess(false);
    setSavedRefundAmount(0);
    setNotes("");
    setReason(RETURN_REASONS[0]);
    setRestockingFeeInput("");
  };

  if (success) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#faf9f6] p-4 sm:p-6 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Check className="w-8 h-8 text-emerald-700" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-1.5">
            Return Processed
          </h2>
          <p className="text-sm text-gray-500 mb-1">
            Order {order && shortId(order.id)} has been refunded.
          </p>
          <p className="text-3xl font-black text-gray-900 my-5">
            ৳{formatBDT(savedRefundAmount)}
          </p>
          <p className="text-xs text-gray-500 mb-7">
            Refund via{" "}
            <span className="font-bold text-gray-800">{refundMethod}</span> •{" "}
            {reason}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="w-full min-h-[48px] py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
          >
            Process Another Return
          </button>
        </div>
      </div>
    );
  }

  const orderDisplayTotal =
    order?.grand_total !== undefined &&
    order.grand_total !== null &&
    order.grand_total > 0
      ? order.grand_total
      : order?.total_amount ?? 0;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] no-scrollbar">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-black text-gray-900 truncate">
            Sales Returns
          </h1>
          <p className="text-xs text-gray-500 font-medium truncate">
            {order
              ? `${shortId(order.id)} • ${order.customer_name || "Walk-in"}`
              : "Look up an order to calculate net refund"}
          </p>
        </div>
        <Link
          href="/dashboard/pos"
          className="min-h-[44px] px-4 py-2 bg-gray-900 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 hover:bg-gray-800 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Sale</span>
        </Link>
      </div>

      <div className="p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-5">
        {/* Left Panel */}
        <div className="flex-1 space-y-5 min-w-0">
          {/* Search */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
              Receipt ID, Customer Name, or Mobile
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFindOrder()}
                  placeholder="Receipt ID, name, or phone..."
                  className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-[#f3f0ea] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <button
                type="button"
                onClick={handleFindOrder}
                disabled={searching || !searchInput.trim()}
                className="min-h-[46px] px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {searching ? "Searching..." : "Find Order"}
              </button>
            </div>

            {searchError && (
              <div className="mt-3 flex items-start gap-2 text-xs sm:text-sm text-red-600 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{searchError}</span>
              </div>
            )}

            {order && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-[#f3f0ea] rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-gray-500" />
                    {shortId(order.id)}
                  </span>
                  <span className="text-gray-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {formatDate(order.created_at)}
                  </span>
                  <span className="text-gray-600 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    {order.customer_name || "Walk-in"}
                  </span>
                </div>
                <span className="text-sm font-black text-gray-900">
                  Paid Total: ৳{formatBDT(orderDisplayTotal)}
                </span>
              </div>
            )}
          </div>

          {/* Select Items */}
          {order && items.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">
                Select Items to Return
              </h2>
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const calcItem = returnCalc.items[idx];
                  const hasDiscountShare =
                    (calcItem?.itemDiscountShare ?? 0) > 0;

                  return (
                    <div
                      key={item.order_item_id}
                      className={`p-3.5 rounded-2xl border-2 transition-all ${
                        item.selected
                          ? "border-gray-200 bg-white"
                          : "border-gray-100 bg-gray-50 opacity-65"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleItem(idx)}
                          className="w-11 h-11 -m-1.5 flex items-center justify-center shrink-0"
                          aria-label={`Select ${item.product_name}`}
                        >
                          {item.selected ? (
                            <CheckSquare className="w-5 h-5 text-gray-900" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-300" />
                          )}
                        </button>

                        <div
                          className={`w-12 h-12 rounded-xl shrink-0 overflow-hidden flex items-center justify-center ${
                            item.image_color || "bg-gray-100"
                          }`}
                        >
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.product_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-gray-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 leading-snug">
                            {item.product_name}
                            {item.variant_label
                              ? ` (${item.variant_label})`
                              : ""}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Purchased: {item.original_qty} × ৳
                            {formatBDT(item.unit_price)}
                          </p>
                          {hasDiscountShare && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                              Discount share deducted: -৳
                              {formatBDT(calcItem.itemDiscountShare)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-gray-100">
                        <div className="flex items-center bg-[#f3f0ea] rounded-xl p-0.5">
                          <button
                            type="button"
                            onClick={() => changeQty(idx, -1)}
                            disabled={!item.selected || item.return_qty <= 1}
                            aria-label="Decrease return quantity"
                            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white transition-colors disabled:opacity-30"
                          >
                            <Minus className="w-4 h-4 text-gray-800" />
                          </button>
                          <span className="w-10 text-center text-sm font-bold text-gray-900">
                            {item.return_qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQty(idx, 1)}
                            disabled={
                              !item.selected ||
                              item.return_qty >= item.original_qty
                            }
                            aria-label="Increase return quantity"
                            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white transition-colors disabled:opacity-30"
                          >
                            <Plus className="w-4 h-4 text-gray-800" />
                          </button>
                        </div>

                        <div className="text-right">
                          <p className="text-base font-extrabold text-gray-900">
                            ৳
                            {formatBDT(calcItem?.refundForReturnedQty ?? 0)}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            Net refundable
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reason & Notes */}
          {order && (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Return Reason
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full min-h-[46px] px-4 py-2.5 bg-[#f3f0ea] rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Condition or size exchange details..."
                    className="w-full min-h-[46px] px-4 py-2.5 bg-[#f3f0ea] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Refund Summary (NO TAX LINE) */}
        <div className="w-full lg:w-84 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="text-base font-black text-gray-900 mb-5">
              Refund Summary
            </h2>

            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-sm text-gray-600 font-medium">
                <span>Item Gross Value</span>
                <span className="text-gray-900 font-bold">
                  ৳{formatBDT(returnCalc.grossReturnSubtotal)}
                </span>
              </div>

              {returnCalc.discountAdjustment > 0 && (
                <div className="flex justify-between text-sm text-emerald-700 font-medium">
                  <span>Order Discount Share</span>
                  <span className="font-bold">
                    -৳{formatBDT(returnCalc.discountAdjustment)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm text-gray-800 font-semibold pt-2 border-t border-gray-100">
                <span>Net Paid Value</span>
                <span className="font-extrabold">
                  ৳{formatBDT(returnCalc.netItemsRefund)}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm text-gray-600 font-medium pt-1">
                <span>Restocking Fee</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-xs font-bold">৳</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={restockingFeeInput}
                    onChange={(e) => setRestockingFeeInput(e.target.value)}
                    placeholder="0.00"
                    className="w-24 min-h-[40px] text-right text-sm font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Total Refund Amount
              </p>
              <p className="text-3xl font-black text-gray-900">
                ৳{formatBDT(returnCalc.totalRefund)}
              </p>
            </div>

            {/* Refund Method */}
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
                Refund Method
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(["Cash", "Card", "Mobile"] as RefundMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRefundMethod(m)}
                    className={`min-h-[48px] py-2 rounded-xl text-xs font-bold border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                      refundMethod === m
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {m === "Cash" && <Banknote className="w-4 h-4" />}
                    {m === "Card" && <CreditCard className="w-4 h-4" />}
                    {m === "Mobile" && <Smartphone className="w-4 h-4" />}
                    <span>{m}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Restock Toggle */}
            <button
              type="button"
              onClick={() => setRestockAll(!restockAll)}
              className="w-full min-h-[52px] mb-5 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-left hover:bg-gray-100 transition-colors"
            >
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Restock Inventory
                </p>
                <p className="text-[11px] text-gray-500">
                  Add returned shoes back to stock
                </p>
              </div>
              <div
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  restockAll ? "bg-gray-900" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    restockAll ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </div>
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={
                !order || selectedItems.length === 0 || submitting
              }
              className="w-full min-h-[48px] py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-2.5 shadow-md"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{submitting ? "Processing..." : "Confirm Return"}</span>
            </button>

            {order && (
              <button
                type="button"
                onClick={handleReset}
                className="w-full min-h-[44px] py-2.5 bg-white border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

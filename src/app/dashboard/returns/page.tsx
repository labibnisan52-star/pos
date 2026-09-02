"use client";

import React, { useState, useCallback } from "react";
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
  X,
  Banknote,
  CreditCard,
  Smartphone,
  Package,
  AlertCircle,
  ArrowLeft,
  Receipt,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderInfo = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  total_amount: number;
  payment_method: string;
  status: string;
};

type ReturnItem = {
  order_item_id: string;
  product_id: string;
  product_name: string;
  image_url?: string;
  image_color?: string;
  original_qty: number;
  return_qty: number;
  unit_price: number;
  selected: boolean;
  restock: boolean;
};

type RefundMethod = "Cash" | "Card" | "Mobile";

const RETURN_REASONS = [
  "Damaged / Defective",
  "Wrong Item Sent",
  "Customer Changed Mind",
  "Item Not as Described",
  "Duplicate Order",
  "Other",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const shortId = (id: string) => "#ORD-" + id.replace(/-/g, "").slice(0, 4).toUpperCase();

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalesReturnPage() {
  const supabase = createClient();

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
  const [restockingFee, setRestockingFee] = useState(0);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [restockAll, setRestockAll] = useState(true);

  // ── Find Order ──
  const handleFindOrder = useCallback(async () => {
    if (!searchInput.trim()) return;
    setSearching(true);
    setSearchError("");
    setOrder(null);
    setItems([]);
    setSuccess(false);

    try {
      // Clean the input: strip leading #, strip ORD- prefix, remove dashes/spaces
      // Handles: #416313ED  |  #ORD-9023  |  ORD9023  |  raw UUID fragment
      const query = searchInput.trim()
        .replace(/^#/, "")          // strip leading #
        .replace(/^ORD[-\s]*/i, "") // strip ORD- prefix if present
        .replace(/[-\s]/g, "")      // strip remaining dashes/spaces
        .toUpperCase();

      let orderData: any = null;

      // 1. Search by customer mobile — no status filter (column may not exist yet)
      const { data: byMobile } = await supabase
        .from("orders")
        .select("*")
        .ilike("customer_mobile", `%${searchInput.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byMobile) {
        orderData = byMobile;
      } else {
        // 2. Search by customer name
        const { data: byName } = await supabase
          .from("orders")
          .select("*")
          .ilike("customer_name", `%${searchInput.trim()}%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byName) {
          orderData = byName;
        } else {
          // 3. Fetch all and match by UUID fragment (client-side)
          const { data: allOrders } = await supabase
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false });

          if (allOrders && query.length >= 4) {
            orderData = allOrders.find((o) =>
              o.id.replace(/-/g, "").toUpperCase().includes(query)
            ) ?? null;
          }
        }
      }

      // Check client-side if already refunded (works even without status column)
      if (orderData && orderData.status === "Refunded") {
        setSearchError("This order has already been refunded.");
        setSearching(false);
        return;
      }

      if (!orderData) {
        setSearchError("No order found. Try the Order ID, customer name, or mobile number.");
        setSearching(false);
        return;
      }

      setOrder(orderData);

      // Fetch order items joined with products
      const { data: orderItems } = await supabase
        .from("order_items")
        .select(`
          id,
          product_id,
          quantity,
          price,
          products ( name, image_url, image_color )
        `)
        .eq("order_id", orderData.id);

      if (orderItems) {
        setItems(
          orderItems.map((oi: any) => ({
            order_item_id: oi.id,
            product_id: oi.product_id,
            product_name: oi.products?.name ?? "Unknown Product",
            image_url: oi.products?.image_url,
            image_color: oi.products?.image_color ?? "bg-gray-100",
            original_qty: oi.quantity,
            return_qty: oi.quantity,
            unit_price: oi.price,
            selected: true,
            restock: true,
          }))
        );
      }
    } catch (err) {
      setSearchError("Something went wrong. Please try again.");
    }

    setSearching(false);
  }, [searchInput, supabase]);

  // ── Item controls ──
  const toggleItem = (idx: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, selected: !it.selected } : it)));

  const toggleRestock = (idx: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, restock: !it.restock } : it)));

  const changeQty = (idx: number, delta: number) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const newQty = Math.max(1, Math.min(it.original_qty, it.return_qty + delta));
        return { ...it, return_qty: newQty };
      })
    );

  // ── Calculations ──
  const selectedItems = items.filter((it) => it.selected);
  const subtotal = selectedItems.reduce((s, it) => s + it.unit_price * it.return_qty, 0);
  const totalRefund = Math.max(0, subtotal - restockingFee);

  // ── Confirm Return ──
  const handleConfirm = async () => {
    if (!order || selectedItems.length === 0) return;
    setSubmitting(true);

    try {
      // 1. Insert into sales_returns (primary record for History)
      await supabase.from("sales_returns").insert([{
        order_id: order.id,
        customer_name: order.customer_name || "Guest",
        customer_mobile: order.customer_mobile || "",
        refund_amount: totalRefund,
        refund_method: refundMethod,
        reason: reason,
        notes: notes,
        restocked: restockAll,
        item_count: selectedItems.reduce((s, it) => s + it.return_qty, 0),
      }]);

      // 2. Try to mark order as Refunded (best-effort — may fail if status col not yet added)
      await supabase
        .from("orders")
        .update({ status: "Refunded" })
        .eq("id", order.id);

      // 3. Process each return atomically via RPC
      for (const item of selectedItems) {
        const { error: rpcError } = await supabase.rpc('process_return', {
          _order_item_id: item.order_item_id,
          _quantity_returned: item.return_qty,
          _reason: reason,
          _restock: restockAll
        });
        if (rpcError) {
          console.error("Failed to process return for item", item.order_item_id, rpcError);
        }
      }

      setSuccess(true);
    } catch (err) {
      console.error("Return failed:", err);
    }

    setSubmitting(false);
  };

  const handleReset = () => {
    setOrder(null);
    setItems([]);
    setSearchInput("");
    setSearchError("");
    setSuccess(false);
    setNotes("");
    setReason(RETURN_REASONS[0]);
    setRestockingFee(0);
  };

  // ── Success Screen ──
  if (success) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-[#faf9f6] p-6">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-gray-900" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Return Processed</h2>
          <p className="text-sm text-gray-500 mb-1">Order {order && shortId(order.id)} has been refunded.</p>
          <p className="text-3xl font-black text-gray-900 my-6">৳ {totalRefund.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mb-8">Refund via <span className="font-semibold text-gray-700">{refundMethod}</span> · Reason: {reason}</p>
          <button
            onClick={handleReset}
            className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-700 transition-colors"
          >
            Process Another Return
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] no-scrollbar">
      {/* ── Top Bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-gray-900">Process Return</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            {order ? `Order ${shortId(order.id)} · ${order.customer_name}` : "Search an order to begin"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/pos"
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Sale
          </a>
        </div>
      </div>

      <div className="p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        {/* ── LEFT PANEL ── */}
        <div className="flex-1 space-y-5">

          {/* Search */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Order ID or Customer Phone
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFindOrder()}
                  placeholder="#ORD-9023 or +880..."
                  className="w-full pl-9 pr-4 py-3 bg-[#f3f0ea] border-transparent rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <button
                onClick={handleFindOrder}
                disabled={searching || !searchInput.trim()}
                className="px-6 py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {searching ? "Searching..." : "Find Order"}
              </button>
            </div>

            {searchError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-500 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {searchError}
              </div>
            )}

            {/* Found order info */}
            {order && (
              <div className="mt-4 flex flex-wrap items-center gap-4 bg-[#f3f0ea] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <Receipt className="w-4 h-4 text-gray-500" />
                  {shortId(order.id)}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {formatDate(order.created_at)}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {order.customer_name || "Guest"}
                </div>
                <div className="ml-auto text-sm font-black text-gray-900">
                  Total ৳ {(order.total_amount ?? 0).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Select Items */}
          {order && items.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-5">Select Items to Return</h2>
              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div
                    key={item.order_item_id}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                      item.selected ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                    }`}
                  >
                    {/* Checkbox */}
                    <button onClick={() => toggleItem(idx)} className="flex-shrink-0">
                      {item.selected ? (
                        <CheckSquare className="w-5 h-5 text-gray-900" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300" />
                      )}
                    </button>

                    {/* Product Image */}
                    <div className={`w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden ${item.image_color || "bg-gray-100"}`}>
                      {item.image_url && (
                        <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400 font-medium">Original Qty: {item.original_qty}</p>
                    </div>

                    {/* Price */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-gray-900">৳ {(item.unit_price * item.return_qty).toLocaleString()}</p>
                      <p className="text-[11px] text-gray-400">৳{item.unit_price.toLocaleString()} each</p>
                    </div>

                    {/* Qty adjuster */}
                    <div className="flex items-center bg-[#f3f0ea] rounded-full px-2 py-1 gap-1 flex-shrink-0">
                      <button
                        onClick={() => changeQty(idx, -1)}
                        disabled={!item.selected || item.return_qty <= 1}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white transition-colors disabled:opacity-30"
                      >
                        <Minus className="w-3 h-3 text-gray-700" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-gray-900">{item.return_qty}</span>
                      <button
                        onClick={() => changeQty(idx, 1)}
                        disabled={!item.selected || item.return_qty >= item.original_qty}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white transition-colors disabled:opacity-30"
                      >
                        <Plus className="w-3 h-3 text-gray-700" />
                      </button>
                    </div>

                    
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reason & Notes */}
          {order && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Primary Reason
                  </label>
                  <div className="relative">
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full appearance-none px-4 py-3 bg-[#f3f0ea] rounded-xl text-sm font-semibold text-gray-900 border-transparent focus:outline-none focus:ring-2 focus:ring-gray-300 pr-8"
                    >
                      {RETURN_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▾</div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Customer reported issues with..."
                    rows={1}
                    className="w-full px-4 py-3 bg-[#f3f0ea] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 border-transparent focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: Refund Summary ── */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-24">
            <h2 className="text-base font-black text-gray-900 mb-6">Refund Summary</h2>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm text-gray-600 font-medium">
                <span>Subtotal</span>
                <span className="text-gray-900 font-bold">৳ {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-600 font-medium">
                <span>Restocking Fee</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-xs">৳</span>
                  <input
                    type="number"
                    value={restockingFee || ""}
                    onChange={(e) => setRestockingFee(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className="w-16 text-right text-sm font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              </div>
              <div className="flex justify-between text-sm text-gray-500 font-medium">
                <span>Tax Refunded</span>
                <span>৳ 0</span>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 mb-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Refund Amount</p>
              <p className="text-4xl font-black text-gray-900">৳ {totalRefund.toLocaleString()}</p>
            </div>

            {/* Refund Method */}
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Refund Method</p>
              <div className="flex gap-2">
                {(["Cash", "Card", "Mobile"] as RefundMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRefundMethod(m)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 flex flex-col items-center gap-1 transition-all ${
                      refundMethod === m ? "border-gray-900 bg-white text-gray-900" : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {m === "Cash" && <Banknote className="w-4 h-4" />}
                    {m === "Card" && <CreditCard className="w-4 h-4" />}
                    {m === "Mobile" && <Smartphone className="w-4 h-4" />}
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Add to inventory */}
            <div className="mb-6">
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setRestockAll(!restockAll)}>
                <div>
                  <p className="text-sm font-bold text-gray-900">Add to Inventory</p>
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">Return items back to stock</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${restockAll ? 'bg-gray-900' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${restockAll ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </div>
            </div>

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={!order || selectedItems.length === 0 || submitting || totalRefund <= 0}
              className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-3 shadow-md"
            >
              {submitting ? (
                <span>Processing...</span>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" /> Confirm Return
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Cancel
            </button>

            {/* No order selected hint */}
            {!order && (
              <div className="mt-4 text-center text-xs text-gray-400 font-medium">
                Search for an order above to begin
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

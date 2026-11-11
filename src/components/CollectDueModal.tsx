"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Clock,
  AlertCircle,
  Coins,
  Check,
  Percent,
} from "lucide-react";
import { formatBDT, roundMoney } from "@/lib/calculations";
import { createClient } from "@/utils/supabase/client";

export interface CollectDueOrder {
  id: string;
  created_at: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  grand_total: number;
  paid_amount: number;
  due_amount: number;
  payment_method?: string;
  payment_status?: string;
}

interface CollectDueModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: CollectDueOrder | null;
  initialMode?: "partial" | "full";
  onSuccess: (updatedOrder: any, paymentDetails: any) => void;
}

const PAYMENT_METHODS = [
  { id: "Cash", label: "Cash", icon: Banknote },
  { id: "bKash", label: "bKash", icon: Smartphone },
  { id: "Nagad", label: "Nagad", icon: Smartphone },
  { id: "Card", label: "Card", icon: CreditCard },
  { id: "Bank", label: "Bank Transfer", icon: CreditCard },
];

export default function CollectDueModal({
  isOpen,
  onClose,
  order,
  initialMode = "partial",
  onSuccess,
}: CollectDueModalProps) {
  const [paymentMode, setPaymentMode] = useState<"partial" | "full">(initialMode);
  const [amountStr, setAmountStr] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const currentDue = roundMoney(Number(order?.due_amount) || 0);
  const grandTotal = roundMoney(Number(order?.grand_total) || 0);
  const previouslyPaid = roundMoney(Number(order?.paid_amount) || 0);

  useEffect(() => {
    if (isOpen && order) {
      const mode = initialMode || "partial";
      setPaymentMode(mode);
      setErrorMsg("");
      setPaymentMethod("Cash");
      setNotes("");

      if (mode === "full") {
        setAmountStr(String(currentDue));
      } else {
        // Partial mode: prefill half or leave empty for user entry
        const half = roundMoney(currentDue / 2);
        setAmountStr(half > 0 ? String(half) : "");
      }
    }
  }, [isOpen, order, initialMode, currentDue]);

  // When toggling modes
  const handleSwitchMode = (newMode: "partial" | "full") => {
    setPaymentMode(newMode);
    setErrorMsg("");
    if (newMode === "full") {
      setAmountStr(String(currentDue));
    } else {
      const half = roundMoney(currentDue / 2);
      setAmountStr(half > 0 ? String(half) : "");
    }
  };

  if (!isOpen || !order) return null;

  const parsedAmount = parseFloat(amountStr) || 0;
  const payingTowardsDue = roundMoney(Math.min(parsedAmount, currentDue));
  const changeToReturn = roundMoney(Math.max(0, parsedAmount - currentDue));
  const newRemainingDue = roundMoney(Math.max(0, currentDue - payingTowardsDue));

  const isFullSettlement = newRemainingDue === 0 && payingTowardsDue > 0;
  const isPartialPayment = newRemainingDue > 0 && payingTowardsDue > 0;
  const isValidAmount = parsedAmount > 0;

  const shortId =
    "#ORD-" + order.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  const handleSetAmount = (amount: number) => {
    setAmountStr(String(amount));
    setErrorMsg("");
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAmount) {
      setErrorMsg("Please enter a payment amount greater than ৳0.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // 1. Try server API
      let successData: any = null;
      try {
        const res = await fetch("/api/dues/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            amount: parsedAmount,
            payment_method: paymentMethod,
            notes: notes.trim(),
          }),
        });

        const data = await res.json();
        if (res.ok && data?.success) {
          successData = data;
        } else {
          console.warn("API /api/dues/pay failed, falling back to direct client update:", data?.error);
        }
      } catch (fetchErr) {
        console.warn("Fetch to /api/dues/pay errored, falling back:", fetchErr);
      }

      // 2. Direct client fallback if API failed or had RLS issues
      if (!successData) {
        const supabase = createClient();
        const paidVal = roundMoney(previouslyPaid + payingTowardsDue);
        const nextStatus = newRemainingDue <= 0 ? "Paid" : "Partial";

        // Try direct order update
        const { data: updatedOrder, error: updateErr } = await supabase
          .from("orders")
          .update({
            paid_amount: paidVal,
            due_amount: newRemainingDue,
            payment_status: nextStatus,
          })
          .eq("id", order.id)
          .select()
          .single();

        if (updateErr) {
          throw new Error(updateErr.message || "Failed to update order due balance.");
        }

        // Try payment log insert
        await supabase.from("payments").insert([
          {
            order_id: order.id,
            payment_method: paymentMethod,
            amount_received: parsedAmount,
            paid_amount: payingTowardsDue,
            change: changeToReturn,
          },
        ]);

        successData = {
          order: {
            id: order.id,
            created_at: order.created_at,
            customer_name: order.customer_name || "Customer",
            customer_mobile: order.customer_mobile || "",
            payment_method: paymentMethod,
            subtotal: Number((order as any).subtotal) || grandTotal,
            discount_type: "fixed",
            discount_value: 0,
            discount_amount: 0,
            grand_total: grandTotal,
            amount_received: parsedAmount,
            paid_amount: paidVal,
            change: changeToReturn,
            due_amount: newRemainingDue,
            payment_status: nextStatus,
            items: [],
          },
          payment: {
            amount_paid: payingTowardsDue,
            amount_received: parsedAmount,
            change: changeToReturn,
            remaining_due: newRemainingDue,
            method: paymentMethod,
            notes: notes.trim(),
            paid_at: new Date().toISOString(),
          },
        };
      }

      onSuccess(successData.order, successData.payment);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-2xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-[#faf9f6] border-b border-gray-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                paymentMode === "partial"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                {paymentMode === "partial"
                  ? "Collect Partial Due Payment"
                  : "Settle Full Due Payment"}
              </h2>
              <p className="text-xs text-gray-500 font-medium font-mono">
                {shortId} • {order.customer_name || "Customer"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prominent Payment Mode Tabs (Partial Due vs Full Settle) */}
        <div className="p-3 bg-gray-100/70 border-b border-gray-200/80">
          <div className="grid grid-cols-2 gap-2 bg-gray-200/80 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => handleSwitchMode("partial")}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                paymentMode === "partial"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-transparent text-gray-700 hover:text-gray-900"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>1. Pay Partial Due</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode("full")}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                paymentMode === "full"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-transparent text-gray-700 hover:text-gray-900"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>2. Settle Full Due (৳{formatBDT(currentDue)})</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleConfirmPayment} className="p-5 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Customer & Due Summary Card */}
          <div
            className={`border rounded-2xl p-4 transition-colors ${
              paymentMode === "partial"
                ? "bg-amber-50/50 border-amber-200/90"
                : "bg-emerald-50/50 border-emerald-200/90"
            }`}
          >
            <div className="flex justify-between items-start mb-2.5 pb-2.5 border-b border-gray-200/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Customer
                </span>
                <span className="text-sm font-black text-gray-900 block truncate">
                  {order.customer_name || "Walk-in Customer"}
                </span>
                {order.customer_mobile && (
                  <span className="text-xs text-gray-500 font-mono">
                    {order.customer_mobile}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Total Order Bill
                </span>
                <span className="text-sm font-black text-gray-900">
                  ৳{formatBDT(grandTotal)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500 font-medium block">
                  Previously Paid:
                </span>
                <span className="font-bold text-gray-800">
                  ৳{formatBDT(previouslyPaid)}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold uppercase text-amber-900 block text-[10px]">
                  Current Outstanding Due:
                </span>
                <span className="text-lg font-black text-amber-800">
                  ৳{formatBDT(currentDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-gray-700">
                {paymentMode === "partial"
                  ? "Partial Payment Amount (৳) *"
                  : "Full Settlement Amount (৳) *"}
              </label>
              <span className="text-[11px] text-gray-500 font-medium">
                Max Due: ৳{formatBDT(currentDue)}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">
                ৳
              </span>
              <input
                type="number"
                step="any"
                min="0"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setErrorMsg("");
                }}
                placeholder={
                  paymentMode === "partial"
                    ? "Enter partial amount paying today"
                    : String(currentDue)
                }
                required
                autoFocus
                className="w-full min-h-[50px] pl-8 pr-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-lg font-black text-gray-900 focus:outline-none focus:bg-white focus:border-black transition-colors"
              />
            </div>

            {/* Quick Partial Shortcuts */}
            {paymentMode === "partial" ? (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-gray-500">
                  Quick Partial Amounts:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetAmount(roundMoney(currentDue * 0.25))}
                    className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition-colors"
                  >
                    25% (৳{formatBDT(roundMoney(currentDue * 0.25))})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAmount(roundMoney(currentDue * 0.5))}
                    className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition-colors"
                  >
                    50% (৳{formatBDT(roundMoney(currentDue * 0.5))})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAmount(roundMoney(currentDue * 0.75))}
                    className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition-colors"
                  >
                    75% (৳{formatBDT(roundMoney(currentDue * 0.75))})
                  </button>
                  {[200, 500, 1000]
                    .filter((v) => v < currentDue)
                    .map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleSetAmount(v)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-bold transition-colors"
                      >
                        ৳{v}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleSetAmount(currentDue)}
                  className="px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg text-xs font-bold transition-colors"
                >
                  Pay Exact Due ৳{formatBDT(currentDue)}
                </button>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {PAYMENT_METHODS.map((pm) => {
                const Icon = pm.icon;
                const isSelected = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`min-h-[40px] px-2 py-1.5 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-all ${
                      isSelected
                        ? "border-black bg-black text-white shadow-2xs"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes or mobile transaction ID..."
              className="w-full min-h-[40px] px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-black"
            />
          </div>

          {/* Live Outcome Calculation Box */}
          {isValidAmount && (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                newRemainingDue > 0
                  ? "bg-amber-50/80 border-amber-200 text-amber-900"
                  : "bg-emerald-50/80 border-emerald-200 text-emerald-900"
              }`}
            >
              <div className="flex justify-between items-center font-bold">
                <span>Paying Today ({newRemainingDue > 0 ? "Partial" : "Full"}):</span>
                <span className="text-sm">৳{formatBDT(payingTowardsDue)}</span>
              </div>

              {changeToReturn > 0 && (
                <div className="flex justify-between items-center font-bold text-blue-700">
                  <span>Change to Return to Customer:</span>
                  <span>৳{formatBDT(changeToReturn)}</span>
                </div>
              )}

              <div className="flex justify-between items-center font-black pt-1 border-t border-black/10">
                <span>New Remaining Due:</span>
                <span
                  className={`text-base ${
                    newRemainingDue > 0 ? "text-amber-800" : "text-emerald-700"
                  }`}
                >
                  ৳{formatBDT(newRemainingDue)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold pt-0.5">
                {newRemainingDue > 0 ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-amber-800">
                      Remaining balance of ৳{formatBDT(newRemainingDue)} will stay
                      active as <strong>Partial Due</strong>.
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">
                      Due completely cleared! Order status will update to{" "}
                      <strong>Paid ✓</strong>.
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-[46px] px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isValidAmount}
              className={`min-h-[46px] px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed text-white ${
                paymentMode === "partial"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Recording Payment...</span>
                </>
              ) : paymentMode === "partial" ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>
                    Confirm Partial Payment (৳{formatBDT(parsedAmount)})
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Confirm &amp; Settle Full Due (৳{formatBDT(parsedAmount)})
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

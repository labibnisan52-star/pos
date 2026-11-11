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
  Receipt,
  Printer,
  ChevronRight,
  ArrowRight,
  Coins,
} from "lucide-react";
import { formatBDT, roundMoney } from "@/lib/calculations";

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
  onSuccess,
}: CollectDueModalProps) {
  const [amountStr, setAmountStr] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (isOpen && order) {
      // Default to paying the entire remaining due
      const due = Number(order.due_amount) || 0;
      setAmountStr(due > 0 ? String(due) : "");
      setPaymentMethod("Cash");
      setNotes("");
      setErrorMsg("");
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const currentDue = roundMoney(Number(order.due_amount) || 0);
  const grandTotal = roundMoney(Number(order.grand_total) || 0);
  const previouslyPaid = roundMoney(Number(order.paid_amount) || 0);

  const parsedAmount = parseFloat(amountStr) || 0;
  const payingTowardsDue = roundMoney(Math.min(parsedAmount, currentDue));
  const changeToReturn = roundMoney(Math.max(0, parsedAmount - currentDue));
  const newRemainingDue = roundMoney(Math.max(0, currentDue - payingTowardsDue));

  const isFullSettlement = parsedAmount >= currentDue && currentDue > 0;
  const isPartialSettlement = parsedAmount > 0 && parsedAmount < currentDue;
  const isValidAmount = parsedAmount > 0;

  const shortId = "#ORD-" + order.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  const handlePreset = (amount: number) => {
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
      if (!res.ok) {
        throw new Error(data.error || "Failed to record due payment.");
      }

      onSuccess(data.order, data.payment);
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
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                Confirm Due Payment
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

        <form onSubmit={handleConfirmPayment} className="p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Customer & Due Summary Card */}
          <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white border border-amber-200/90 rounded-2xl p-4 sm:p-5">
            <div className="flex justify-between items-start mb-3 pb-3 border-b border-amber-200/60">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
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
                  Total Bill
                </span>
                <span className="text-sm font-black text-gray-900">
                  ৳{formatBDT(grandTotal)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Already Paid
                </span>
                <span className="text-sm font-bold text-gray-700">
                  ৳{formatBDT(previouslyPaid)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                  Outstanding Due
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-700">
                  ৳{formatBDT(currentDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-gray-700">
                Amount Received (৳) <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-gray-500 font-medium">
                Due: ৳{formatBDT(currentDue)}
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
                placeholder="Enter amount customer is paying"
                required
                autoFocus
                className="w-full min-h-[50px] pl-8 pr-4 bg-gray-50 border-2 border-gray-200 rounded-2xl text-lg font-black text-gray-900 focus:outline-none focus:bg-white focus:border-black transition-colors"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handlePreset(currentDue)}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-colors"
              >
                Pay Full (৳{formatBDT(currentDue)})
              </button>
              {currentDue > 100 && (
                <button
                  type="button"
                  onClick={() => handlePreset(roundMoney(currentDue / 2))}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-colors"
                >
                  Pay 50% (৳{formatBDT(roundMoney(currentDue / 2))})
                </button>
              )}
              {[500, 1000, 2000]
                .filter((v) => v < currentDue)
                .map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handlePreset(v)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-colors"
                  >
                    ৳{v}
                  </button>
                ))}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((pm) => {
                const Icon = pm.icon;
                const isSelected = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                      isSelected
                        ? "border-black bg-black text-white shadow-sm"
                        : "border-gray-200 bg-gray-50/80 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes / Reference */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
              Payment Note / TrxID (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. bKash TrxID #8AK29L or collected at shop counter"
              className="w-full min-h-[42px] px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-black"
            />
          </div>

          {/* Live Outcome Calculation Preview */}
          {isValidAmount && (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                isFullSettlement
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                  : "bg-amber-50/80 border-amber-200 text-amber-900"
              }`}
            >
              <div className="flex justify-between items-center font-bold">
                <span>Payment Towards Due:</span>
                <span>৳{formatBDT(payingTowardsDue)}</span>
              </div>

              {changeToReturn > 0 && (
                <div className="flex justify-between items-center font-black text-blue-700">
                  <span>Change to Return to Customer:</span>
                  <span>৳{formatBDT(changeToReturn)}</span>
                </div>
              )}

              <div className="flex justify-between items-center font-black pt-1 border-t border-black/10">
                <span>Remaining Due After Payment:</span>
                <span>৳{formatBDT(newRemainingDue)}</span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold pt-0.5">
                {newRemainingDue === 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">
                      Order will be marked as FULLY PAID ✓
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-amber-800">
                      Remaining due ৳{formatBDT(newRemainingDue)} remains active
                      (Partial Due)
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
              className="min-h-[46px] px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !isValidAmount}
              className="min-h-[46px] px-6 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Recording Payment...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Confirm Payment &amp; Settle (৳{formatBDT(parsedAmount)})
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

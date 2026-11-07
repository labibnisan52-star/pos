"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { calculateLineTotal, parseNumericInput, roundMoney } from "@/lib/calculations";

interface AddStockModalProps {
  productId: string;
  productName: string;
  currentStock: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddStockModal({
  productId,
  productName,
  currentStock,
  isOpen,
  onClose,
  onSuccess,
}: AddStockModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [quantity, setQuantity] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [costCNY, setCostCNY] = useState<string>("");
  const [directCostBDT, setDirectCostBDT] = useState<string>("");
  const [costCurrency, setCostCurrency] = useState<"CNY" | "BDT">("BDT");
  const [shippingBDT, setShippingBDT] = useState<string>("");
  const [bankRate, setBankRate] = useState<string>("17.0");
  const [sellingPriceBDT, setSellingPriceBDT] = useState<string>("");
  const [targetMargin, setTargetMargin] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const numericQty = Math.max(0, Math.floor(parseNumericInput(quantity).value));
  const numericBankRate = parseNumericInput(bankRate).value;
  const numericCostCNY = parseNumericInput(costCNY).value;
  const numericDirectCostBDT = parseNumericInput(directCostBDT).value;
  const numericShippingBDT = parseNumericInput(shippingBDT).value;
  const parsedSellingPrice = parseNumericInput(sellingPriceBDT);
  const hasSellingPrice = !parsedSellingPrice.isEmpty && parsedSellingPrice.isValid;

  const costBDT =
    costCurrency === "CNY"
      ? roundMoney(numericCostCNY * numericBankRate)
      : roundMoney(numericDirectCostBDT);
  const perUnitShipping =
    numericQty > 0 ? numericShippingBDT / numericQty : numericShippingBDT;
  const trueLandedCost = roundMoney(costBDT + perUnitShipping);
  const expectedProfit = hasSellingPrice
    ? roundMoney(parsedSellingPrice.value - trueLandedCost)
    : 0;
  const profitMargin =
    trueLandedCost > 0 && hasSellingPrice
      ? (expectedProfit / trueLandedCost) * 100
      : 0;

  useEffect(() => {
    const parsedMargin = parseNumericInput(targetMargin);
    if (!parsedMargin.isEmpty && parsedMargin.isValid && trueLandedCost > 0) {
      const newPrice = Math.round(trueLandedCost * (1 + parsedMargin.value / 100));
      setSellingPriceBDT(String(newPrice));
    }
  }, [targetMargin, trueLandedCost]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (numericQty <= 0) {
      setErrorMsg("Quantity must be greater than 0.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const totalCost = roundMoney(
      calculateLineTotal(costBDT, numericQty) + numericShippingBDT
    );

    const { error: poError } = await supabase.from("purchase_orders").insert([
      {
        product_id: productId,
        product_name: productName,
        supplier_name: supplierName.trim() || "Direct Intake",
        quantity: numericQty,
        remaining_quantity: numericQty,
        cost_cny: costCurrency === "CNY" ? roundMoney(numericCostCNY) : 0,
        cost_bdt: costBDT,
        shipping_bdt: roundMoney(numericShippingBDT),
        total_cost: totalCost,
        selling_price:
          hasSellingPrice && parsedSellingPrice.value > 0
            ? roundMoney(parsedSellingPrice.value)
            : 0,
        payment_method: paymentMethod,
        received_by: "Store Manager",
        status: "Received",
      },
    ]);

    if (poError) {
      setErrorMsg(poError.message);
      setLoading(false);
      return;
    }

    const newStock = currentStock + numericQty;
    const updatePayload: Record<string, any> = { stock: newStock };
    if (hasSellingPrice && parsedSellingPrice.value > 0) {
      updatePayload.price = roundMoney(parsedSellingPrice.value);
    }
    if (trueLandedCost > 0) {
      updatePayload.cost_price = trueLandedCost;
    }

    const { error: stockError } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", productId);

    if (stockError) {
      setErrorMsg(stockError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[94dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            Add New Stock
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="bg-blue-50 text-blue-800 text-sm font-semibold p-3 rounded-xl border border-blue-100">
            Adding stock for: {productName}
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Supplier Name
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Optional supplier"
                className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Mobile Banking">Mobile Banking</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) =>
                  setQuantity(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="0"
                className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Rate (BDT/CNY)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={bankRate}
                onChange={(e) => setBankRate(e.target.value)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-[#f8f6f0] rounded-2xl p-4 sm:p-5 border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-900">Pricing</h3>
              <div className="flex bg-gray-200 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCostCurrency("BDT")}
                  className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    costCurrency === "BDT"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  BDT ৳
                </button>
                <button
                  type="button"
                  onClick={() => setCostCurrency("CNY")}
                  className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    costCurrency === "CNY"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  CNY ¥
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {costCurrency === "CNY" ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Cost Price (CNY ¥)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400 text-sm font-medium">
                        ¥
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={costCNY}
                      onChange={(e) => setCostCNY(e.target.value)}
                      placeholder="0.00"
                      className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Cost Price (BDT ৳)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400 text-sm font-medium">
                        ৳
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={directCostBDT}
                      onChange={(e) => setDirectCostBDT(e.target.value)}
                      placeholder="0.00"
                      className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Total Batch Shipping (BDT ৳)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={shippingBDT}
                    onChange={(e) => setShippingBDT(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center py-2.5 border-y border-gray-200/60">
                <span className="text-sm font-semibold text-gray-700">
                  True Landed Cost (per unit)
                </span>
                <span className="text-base font-bold text-gray-900">
                  ৳ {trueLandedCost.toFixed(2)}
                </span>
              </div>

              <div>
                <div className="flex flex-wrap justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Selling Price (BDT ৳)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-500">
                      Margin:
                    </span>
                    <div className="relative w-20">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="20"
                        value={targetMargin}
                        onChange={(e) => setTargetMargin(e.target.value)}
                        className="w-full pl-2 pr-5 py-1 bg-white text-gray-900 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                      <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-[10px] font-medium">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sellingPriceBDT}
                    onChange={(e) => {
                      setSellingPriceBDT(e.target.value);
                      setTargetMargin("");
                    }}
                    placeholder="Leave blank to keep current price"
                    className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>

                {hasSellingPrice && (
                  <div className="mt-3 bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Expected Profit
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          expectedProfit >= 0
                            ? "bg-green-50 text-green-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        ~ {profitMargin.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-baseline">
                      <span className="text-xl font-black text-gray-900">
                        ৳ {expectedProfit.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-medium text-gray-400 ml-1">
                        / unit
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex justify-end items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="min-h-[44px] px-6 py-2.5 bg-black text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors shadow-md disabled:opacity-50"
          >
            {loading ? "Saving..." : "Add Stock"}
          </button>
        </div>
      </div>
    </div>
  );
}

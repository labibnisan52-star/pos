"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface AddStockModalProps {
  productId: string;
  productName: string;
  currentStock: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddStockModal({ productId, productName, currentStock, isOpen, onClose, onSuccess }: AddStockModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [quantity, setQuantity] = useState<number | "">("");
  const [supplierName, setSupplierName] = useState("");
  const [costCNY, setCostCNY] = useState<number | "">("");
  const [directCostBDT, setDirectCostBDT] = useState<number | "">("");
  const [costCurrency, setCostCurrency] = useState<"CNY" | "BDT">("CNY");
  const [shippingBDT, setShippingBDT] = useState<number | "">("");
  const [bankRate, setBankRate] = useState<number>(17.0);
  const [sellingPriceBDT, setSellingPriceBDT] = useState<number | "">("");
  const [targetMargin, setTargetMargin] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const costBDT = costCurrency === "CNY" ? (Number(costCNY) || 0) * bankRate : (Number(directCostBDT) || 0);
  const trueLandedCost = costBDT + ((Number(shippingBDT) || 0) / (Number(quantity) || 1));
  const expectedProfit = (Number(sellingPriceBDT) || 0) - trueLandedCost;
  const profitMargin = trueLandedCost > 0 
    ? (expectedProfit / trueLandedCost) * 100 
    : 0;

  React.useEffect(() => {
    if (targetMargin !== "" && trueLandedCost > 0) {
      const newPrice = trueLandedCost * (1 + Number(targetMargin) / 100);
      setSellingPriceBDT(Math.round(newPrice));
    }
  }, [targetMargin, trueLandedCost]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!quantity || Number(quantity) <= 0) {
      setErrorMsg("Quantity must be greater than 0");
      return;
    }
    
    setLoading(true);
    setErrorMsg("");

    const totalCost = trueLandedCost * Number(quantity);

    // 1. Insert into purchase_orders
    const { error: poError } = await supabase.from('purchase_orders').insert([{
      product_id: productId,
      product_name: productName,
      supplier_name: supplierName || 'Unknown',
      quantity: Number(quantity),
      remaining_quantity: Number(quantity),
      cost_cny: Number(costCNY) || 0,
      cost_bdt: costBDT,
      shipping_bdt: Number(shippingBDT) || 0,
      total_cost: totalCost,
      selling_price: 0, // Usually inherited from product, omit or update later
      payment_method: paymentMethod,
      received_by: 'Store Manager',
      status: 'Received'
    }]);

    if (poError) {
      setErrorMsg(poError.message);
      setLoading(false);
      return;
    }

    // 2. Update stock in products table
    const newStock = currentStock + Number(quantity);
    const updatePayload: any = { stock: newStock };
    if (sellingPriceBDT) updatePayload.price = Number(sellingPriceBDT);
    if (trueLandedCost) updatePayload.cost_price = trueLandedCost;

    const { error: stockError } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', productId);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Add New Stock</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-blue-50 text-blue-800 text-sm font-semibold p-3 rounded-lg border border-blue-100">
            Adding stock for: {productName}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Supplier Name</label>
            <input 
              type="text" 
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="e.g. Ali Traders"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                placeholder="0"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Rate (BDT/CNY)</label>
              <input 
                type="number" 
                value={bankRate}
                onChange={e => setBankRate(Number(e.target.value))}
                step="0.01"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>
          
          {/* Pricing Section (Matching AddProductModal) */}
          <div className="bg-[#f8f6f0] rounded-2xl p-5 border border-gray-100 mt-2">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold text-gray-900">Pricing</h3>
              <div className="flex bg-gray-200 p-1 rounded-lg">
                <button 
                  type="button"
                  onClick={() => setCostCurrency("CNY")} 
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${costCurrency === "CNY" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  CNY ¥
                </button>
                <button 
                  type="button"
                  onClick={() => setCostCurrency("BDT")} 
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${costCurrency === "BDT" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  BDT ৳
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {costCurrency === "CNY" ? (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cost Price (CNY ¥)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">¥</span>
                      </div>
                      <input 
                        type="number" 
                        value={costCNY}
                        onChange={e => setCostCNY(Number(e.target.value))}
                        placeholder="0.00" 
                        className="w-full pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cost Price (BDT ৳)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">৳</span>
                      </div>
                      <input 
                        type="number" 
                        value={directCostBDT}
                        onChange={e => setDirectCostBDT(Number(e.target.value))}
                        placeholder="0.00" 
                        className="w-full pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Total Shipping Charge (BDT ৳)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input 
                    type="number" 
                    value={shippingBDT}
                    onChange={e => setShippingBDT(Number(e.target.value))}
                    placeholder="0.00" 
                    className="w-full pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center py-2.5 border-y border-gray-200/60">
                <span className="text-sm font-semibold text-gray-700">True Landed Cost (per unit)</span>
                <span className="text-base font-bold text-gray-900">৳ {trueLandedCost.toFixed(2)}</span>
              </div>

              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Selling Price (BDT ৳)</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-500">Add Margin:</span>
                    <div className="relative w-20">
                      <input 
                        type="number"
                        placeholder="e.g. 20"
                        value={targetMargin}
                        onChange={e => setTargetMargin(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full pl-2 pr-5 py-1 bg-white text-gray-900 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                      <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-[10px] font-medium">%</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input 
                    type="number" 
                    value={sellingPriceBDT}
                    onChange={e => {
                      setSellingPriceBDT(e.target.value === "" ? "" : Number(e.target.value));
                      setTargetMargin("");
                    }}
                    placeholder="Leave blank to keep current price" 
                    className="w-full pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                
                <div className="mt-2 bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expected Profit</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${expectedProfit >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                      ~ {profitMargin.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-xl font-black text-gray-900">৳ {expectedProfit.toFixed(2)}</span>
                    <span className="text-[10px] font-medium text-gray-400 ml-1">/ unit</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <div className="text-red-500 text-sm font-medium">{errorMsg}</div>
          <div className="flex space-x-3">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              className="px-6 py-2.5 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-md disabled:opacity-50"
            >
              {loading ? "Saving..." : "Add Stock"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Search, ShoppingCart, User, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { calculateLineTotal, formatBDT } from "@/lib/calculations";

type PurchaseOrder = {
  id: string;
  created_at: string;
  supplier_name: string;
  product_name: string;
  quantity: number;
  total_cost: number;
  payment_method: string;
  status: string;
};

type Product = {
  id: string;
  name: string;
  stock: number;
};

export default function PurchasesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [poRes, prodRes] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, stock").order("name"),
    ]);

    if (poRes.data) setPurchases(poRes.data);
    if (prodRes.data) setProducts(prodRes.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const previewTotalCost = useMemo(
    () => calculateLineTotal(unitCost, quantity),
    [unitCost, quantity]
  );

  const handleLogPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity || !unitCost || saving) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const qtyNum = Math.max(1, parseInt(quantity, 10) || 1);
    const totalCost = calculateLineTotal(unitCost, qtyNum);

    setSaving(true);
    try {
      const { error: insertError } = await supabase
        .from("purchase_orders")
        .insert([
          {
            supplier_name: supplier.trim() || "Direct Supplier",
            product_id: selectedProductId,
            product_name: product.name,
            quantity: qtyNum,
            remaining_quantity: qtyNum,
            total_cost: totalCost,
            payment_method: paymentMethod,
            status: "Received",
          },
        ]);

      if (!insertError) {
        await supabase
          .from("products")
          .update({ stock: (Number(product.stock) || 0) + qtyNum })
          .eq("id", selectedProductId);

        setSelectedProductId("");
        setQuantity("1");
        setUnitCost("");
        setSupplier("");
        setShowModal(false);
        fetchData();
      } else {
        alert("Failed to save purchase: " + insertError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredPurchases = purchases.filter(
    (po) =>
      po.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      po.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Purchases &amp; Restocking
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
            Record incoming shoe batches and supplier costs
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="min-h-[46px] px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Log Purchase</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">
            Loading purchases...
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="p-14 text-center text-sm text-gray-400">
            No purchase batches recorded yet. Tap &ldquo;Log Purchase&rdquo; to
            add incoming stock.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredPurchases.map((po) => (
                <div key={po.id} className="p-4 space-y-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {po.product_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {po.supplier_name || "Direct Supplier"} •{" "}
                        {new Date(po.created_at).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <p className="text-sm font-black text-gray-900 shrink-0">
                      ৳{formatBDT(po.total_cost)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{po.payment_method}</span>
                    <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                      +{po.quantity} units
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <th className="p-4 pl-6 border-b border-gray-100">Date</th>
                    <th className="p-4 border-b border-gray-100">Product</th>
                    <th className="p-4 border-b border-gray-100">Supplier</th>
                    <th className="p-4 border-b border-gray-100 text-right">
                      Quantity
                    </th>
                    <th className="p-4 pr-6 border-b border-gray-100 text-right">
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm font-medium text-gray-900">
                  {filteredPurchases.map((po) => (
                    <tr
                      key={po.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-4 pl-6 text-gray-500 whitespace-nowrap">
                        {new Date(po.created_at).toLocaleDateString("en-GB")}
                      </td>
                      <td className="p-4 font-bold">{po.product_name}</td>
                      <td className="p-4 text-gray-600">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span>{po.supplier_name || "Direct Supplier"}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md font-bold text-xs">
                          +{po.quantity}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right font-black text-gray-900 whitespace-nowrap">
                        ৳{formatBDT(po.total_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Log Purchase Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Log New Purchase</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close modal"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogPurchase} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Product
                </label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                >
                  <option value="" disabled>
                    Select a product to restock...
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Quantity Received
                  </label>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(e.target.value.replace(/[^\d]/g, ""))
                    }
                    className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Unit Cost (৳)
                  </label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Enter supplier or wholesaler name"
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full min-h-[46px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-900"
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Mobile</option>
                  <option>Credit</option>
                </select>
              </div>

              <div className="bg-[#f3f0ea] p-4 rounded-xl flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">
                  Total Purchase Cost
                </span>
                <span className="text-xl font-black text-gray-900">
                  ৳{formatBDT(previewTotalCost)}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 min-h-[46px] py-2.5 border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[46px] py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 text-sm disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save & Update Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

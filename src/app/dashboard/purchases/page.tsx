"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, ShoppingCart, Calendar, ArrowRight, User } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

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
  const supabase = createClient();
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  
  // Form State
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const fetchData = async () => {
    setLoading(true);
    // Fetch Purchases
    const { data: poData } = await supabase
      .from("purchase_orders")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (poData) setPurchases(poData);

    // Fetch Products for the dropdown
    const { data: prodData } = await supabase
      .from("products")
      .select("id, name, stock")
      .order("name");
      
    if (prodData) setProducts(prodData);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  const handleLogPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity || !unitCost) return;

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const totalCost = Number(quantity) * Number(unitCost);

    // 1. Insert into purchase_orders
    const { error: insertError } = await supabase.from("purchase_orders").insert([{
      supplier_name: supplier || "Unknown",
      product_id: selectedProductId,
      product_name: product.name,
      quantity: Number(quantity),
      total_cost: totalCost,
      payment_method: paymentMethod,
      status: "Received"
    }]);

    if (!insertError) {
      // 2. Update product stock (and optionally cost_price, but we'll just update stock to keep it safe)
      await supabase
        .from("products")
        .update({ stock: product.stock + Number(quantity) })
        .eq("id", selectedProductId);

      // Reset form
      setSelectedProductId("");
      setQuantity("1");
      setUnitCost("");
      setSupplier("");
      setShowModal(false);
      fetchData();
    } else {
      alert("Error saving purchase");
    }
  };

  const filteredPurchases = purchases.filter(po => 
    po.product_name.toLowerCase().includes(search.toLowerCase()) || 
    po.supplier_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Purchase History</h1>
          <p className="text-sm text-gray-500 font-medium">Track incoming stock and supplier expenses.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Log Purchase
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products or suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border-transparent rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="p-4 pl-6 border-b border-gray-100">Date</th>
                <th className="p-4 border-b border-gray-100">Product</th>
                <th className="p-4 border-b border-gray-100">Supplier</th>
                <th className="p-4 border-b border-gray-100 text-right">Quantity</th>
                <th className="p-4 pr-6 border-b border-gray-100 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm font-medium text-gray-900">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">Loading purchases...</td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">No purchases found.</td>
                </tr>
              ) : (
                filteredPurchases.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 pl-6 text-gray-500 whitespace-nowrap">
                      {new Date(po.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 font-bold">{po.product_name}</td>
                    <td className="p-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        {po.supplier_name || "Unknown"}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-bold">
                        +{po.quantity}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right font-black text-gray-900">
                      ৳ {po.total_cost.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Purchase Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Log New Purchase
            </h2>
            <form onSubmit={handleLogPurchase} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Product</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                >
                  <option value="" disabled>Select a product to restock...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Current Stock: {p.stock})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">* Logging this purchase will automatically increase the product's stock.</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Quantity Received</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Unit Cost (৳)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitCost}
                    onChange={e => setUnitCost(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier / Vendor Name</label>
                <input
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Credit</option>
                </select>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex items-center justify-between mt-4">
                <span className="text-sm font-bold text-gray-500">Total Purchase Cost:</span>
                <span className="text-xl font-black text-gray-900">
                  ৳ {(Number(quantity) * Number(unitCost)).toLocaleString()}
                </span>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800">Save Purchase & Update Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  ArrowLeft,
  Edit,
  Trash2,
  TrendingUp,
  Package,
  TriangleAlert,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import AddStockModal from "@/components/AddStockModal";
import AddProductModal from "@/components/AddProductModal";
import {
  calculateLineTotal,
  formatBDT,
  roundMoney,
} from "@/lib/calculations";

type ProductVariant = {
  id: string;
  image_url: string;
  variant_name: string;
  variant_value: string;
  sku: string;
  price?: number;
  stock_multiplier?: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  cost_price?: number;
  stock: number;
  category: string;
  image_color: string;
  image_url?: string;
  barcode?: string;
  unit?: string;
  product_type?: string;
  brand?: string;
  description?: string;
  warranty?: string;
  variants?: ProductVariant[];
};

type SalesHistoryItem = {
  id: string;
  quantity: number;
  price: number;
  net_amount?: number;
  unit_cost_price?: number;
  unit_selling_price?: number;
  created_at: string;
  orders: {
    customer_name: string;
    customer_mobile: string;
  };
};

export default function ProductDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [product, setProduct] = useState<Product | null>(null);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryItem[]>([]);
  const [fifoStockValue, setFifoStockValue] = useState<number>(0);
  const [activeBatches, setActiveBatches] = useState<
    {
      id: string;
      created_at: string;
      remaining_quantity: number;
      unit_cost: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [searchCustomer, setSearchCustomer] = useState("");
  const [dateRange, setDateRange] = useState("All Time");
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        alert("Failed to delete product: " + error.message);
      } else {
        router.push("/dashboard/products");
      }
    }
  };

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      const { data: vData } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", id);

      setProduct({ ...data, variants: vData || [] });

      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("id, created_at, remaining_quantity, total_cost, quantity")
        .eq("product_id", id)
        .gt("remaining_quantity", 0)
        .order("created_at", { ascending: true });

      let value = 0;
      let accountedStock = 0;
      const parsedBatches: {
        id: string;
        created_at: string;
        remaining_quantity: number;
        unit_cost: number;
      }[] = [];

      for (const po of poData || []) {
        const unitCost = po.quantity > 0 ? po.total_cost / po.quantity : 0;
        value += po.remaining_quantity * unitCost;
        accountedStock += po.remaining_quantity;
        parsedBatches.push({
          id: po.id,
          created_at: po.created_at,
          remaining_quantity: po.remaining_quantity,
          unit_cost: unitCost,
        });
      }

      if (data.stock > accountedStock) {
        const fallbackCost = data.cost_price || 0;
        const fallbackQty = data.stock - accountedStock;
        value += fallbackQty * fallbackCost;
        parsedBatches.unshift({
          id: "initial-stock",
          created_at: "Opening Stock",
          remaining_quantity: fallbackQty,
          unit_cost: fallbackCost,
        });
      }
      setFifoStockValue(roundMoney(value));
      setActiveBatches(parsedBatches);
    }

    const { data: salesData } = await supabase
      .from("order_items")
      .select(
        `
        id,
        quantity,
        price,
        net_amount,
        unit_cost_price,
        unit_selling_price,
        created_at,
        orders ( customer_name, customer_mobile )
      `
      )
      .eq("product_id", id)
      .order("created_at", { ascending: false });

    if (salesData) {
      setSalesHistory(salesData as unknown as SalesHistoryItem[]);
    }

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    if (id) {
      fetchProduct();
    }
  }, [id, fetchProduct]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        Loading product...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Product not found.
      </div>
    );
  }

  const costPrice = product.cost_price || 0;

  // Chronological 7-month sales trend
  const salesTrendData = (() => {
    const trend: {
      name: string;
      sales: number;
      year: number;
      monthIndex: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      trend.push({
        name: d.toLocaleDateString("en-US", { month: "short" }),
        sales: 0,
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
      });
    }

    salesHistory.forEach((item) => {
      const itemDate = new Date(item.created_at);
      const monthItem = trend.find(
        (t) =>
          t.year === itemDate.getFullYear() &&
          t.monthIndex === itemDate.getMonth()
      );
      if (monthItem) {
        monthItem.sales += item.quantity;
      }
    });

    return trend;
  })();

  const filteredSalesHistory = salesHistory.filter((item) => {
    if (searchCustomer) {
      const custName = (item.orders?.customer_name || "Walk-in").toLowerCase();
      const custMobile = (item.orders?.customer_mobile || "").toLowerCase();
      const q = searchCustomer.toLowerCase();
      if (!custName.includes(q) && !custMobile.includes(q)) return false;
    }

    if (dateRange !== "All Time") {
      const d = new Date(item.created_at);
      const now = new Date();
      const diffDays = Math.ceil(
        Math.abs(now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (dateRange === "Last 7 Days" && diffDays > 7) return false;
      if (dateRange === "Last 30 Days" && diffDays > 30) return false;
      if (
        dateRange === "This Month" &&
        (d.getMonth() !== now.getMonth() ||
          d.getFullYear() !== now.getFullYear())
      ) {
        return false;
      }
    }

    return true;
  });

  const getItemNetPaid = (item: SalesHistoryItem) =>
    item.net_amount !== undefined &&
    item.net_amount !== null &&
    Number(item.net_amount) > 0
      ? Number(item.net_amount)
      : calculateLineTotal(item.price, item.quantity);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="w-11 h-11 flex items-center justify-center text-gray-600 hover:text-gray-900 rounded-xl bg-white border border-gray-200 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 truncate">
              {product.name}
            </h1>
            <div className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
              Barcode / SKU: {product.barcode || "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddStockModal(true)}
            className="min-h-[44px] px-4 py-2 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
          >
            <span>+ Add Stock</span>
          </button>
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="min-h-[44px] px-4 py-2 bg-white border border-gray-200 text-gray-800 font-bold rounded-xl hover:bg-gray-50 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="min-h-[44px] px-4 py-2 bg-red-50 border border-red-200 text-red-700 font-bold rounded-xl hover:bg-red-100 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left Metadata Card (NO Tax Rate / Tax Type — Tax is always 0) */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col h-fit">
          <div
            className={`w-full aspect-square rounded-xl ${
              product.image_color || "bg-gray-100"
            } border border-gray-100 overflow-hidden relative mb-5 flex items-center justify-center`}
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gray-400 text-sm">No Image</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-y-5 gap-x-4">
            <div>
              <div className="text-sm font-bold text-gray-900">
                {product.category || "—"}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Category
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                {product.product_type || "Single Product"}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Type
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                {product.unit || "Pair"}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Unit
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                {product.brand || "Rizq"}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Brand
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                ৳{formatBDT(product.price)}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Selling Price
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">
                ৳{formatBDT(costPrice)}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Cost Price
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-sm font-semibold text-gray-900">
                {product.warranty || "No Warranty"}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Warranty
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-sm font-medium text-gray-700">
                {product.description || "No description provided."}
              </div>
              <div className="text-[11px] text-gray-500 font-medium uppercase mt-0.5">
                Description
              </div>
            </div>
          </div>

          {product.variants && product.variants.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
                Sizes / Variants ({product.variants.length})
              </h4>
              <div className="space-y-1.5">
                {product.variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-xs bg-gray-50 px-3 py-2 rounded-lg"
                  >
                    <span className="font-bold text-gray-800">
                      {v.variant_name ? `${v.variant_name}: ` : ""}
                      {v.variant_value}
                    </span>
                    <span className="font-semibold text-gray-600">
                      ৳{formatBDT(v.price || product.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Analytics & History Column */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">
                  Current Stock
                </h3>
                <div className="text-3xl font-black text-gray-900 flex items-baseline gap-1.5">
                  <span>{product.stock}</span>
                  <span className="text-xs font-semibold text-gray-500">
                    {product.unit || "Pair"}s
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center text-gray-600">
                <Package className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">
                  Inventory Value
                </h3>
                <div className="text-2xl sm:text-3xl font-black text-gray-900">
                  ৳{formatBDT(fifoStockValue)}
                </div>
              </div>
              <TrendingUp className="w-6 h-6 text-emerald-600 shrink-0" />
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">
                  Stock Alert
                </h3>
                <div className="text-xl font-black text-gray-900">
                  {product.stock === 0
                    ? "Out of Stock"
                    : product.stock <= 5
                    ? "Low Stock"
                    : "Healthy"}
                </div>
              </div>
              <TriangleAlert
                className={`w-6 h-6 shrink-0 ${
                  product.stock <= 5 ? "text-amber-500" : "text-gray-300"
                }`}
              />
            </div>
          </div>

          {/* Item Sales History */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h3 className="text-base sm:text-lg font-bold text-gray-900">
                Sales History
              </h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="min-h-[42px] px-3 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-700 font-semibold bg-gray-50 focus:outline-none"
                >
                  <option value="All Time">All Time</option>
                  <option value="Last 7 Days">Last 7 Days</option>
                  <option value="Last 30 Days">Last 30 Days</option>
                  <option value="This Month">This Month</option>
                </select>
                <input
                  type="text"
                  placeholder="Search customer..."
                  value={searchCustomer}
                  onChange={(e) => setSearchCustomer(e.target.value)}
                  className="min-h-[42px] px-3.5 py-2 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-900 bg-gray-50 focus:outline-none focus:bg-white"
                />
              </div>
            </div>

            {filteredSalesHistory.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No sales recorded for this product yet.
              </p>
            ) : (
              <>
                <div className="md:hidden divide-y divide-gray-100">
                  {filteredSalesHistory.map((item) => (
                    <div key={item.id} className="py-3 flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {item.orders?.customer_name || "Walk-in"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.created_at).toLocaleDateString("en-GB")}{" "}
                          • Qty: {item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-black text-gray-900 shrink-0">
                        ৳{formatBDT(getItemNetPaid(item))}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-600 uppercase">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Mobile</th>
                        <th className="px-4 py-3">Qty Sold</th>
                        <th className="px-4 py-3 text-right">Net Amount (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-semibold text-gray-700 divide-y divide-gray-50">
                      {filteredSalesHistory.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3.5">
                            {new Date(item.created_at).toLocaleDateString(
                              "en-GB"
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {item.orders?.customer_name || "Walk-in"}
                          </td>
                          <td className="px-4 py-3.5">
                            {item.orders?.customer_mobile || "—"}
                          </td>
                          <td className="px-4 py-3.5">{item.quantity}</td>
                          <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                            ৳{formatBDT(getItemNetPaid(item))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Bottom Grid: Batches & Monthly Trend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 flex flex-col">
              <h3 className="text-base font-bold text-gray-900 mb-4">
                Active Stock Batches (FIFO)
              </h3>
              {activeBatches.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No active stock batches.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {activeBatches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs sm:text-sm"
                    >
                      <div>
                        <p className="font-bold text-gray-900">
                          {batch.created_at.includes("Opening")
                            ? batch.created_at
                            : new Date(batch.created_at).toLocaleDateString(
                                "en-GB"
                              )}
                        </p>
                        <p className="text-xs text-gray-500">
                          Cost: ৳{formatBDT(batch.unit_cost)} / unit
                        </p>
                      </div>
                      <span className="font-black text-gray-900">
                        {batch.remaining_quantity} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 flex flex-col">
              <h3 className="text-base font-bold text-gray-900 mb-4">
                Monthly Units Sold
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesTrendData}>
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: "12px",
                        borderRadius: "10px",
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#111827"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#111827" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddStockModal
        isOpen={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        onSuccess={fetchProduct}
        productId={product.id}
        productName={product.name}
        currentStock={product.stock}
      />

      <AddProductModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={fetchProduct}
        productToEdit={product as never}
      />
    </div>
  );
}

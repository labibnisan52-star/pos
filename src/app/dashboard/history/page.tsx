"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CreditCard,
  Smartphone,
  Banknote,
  Download,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  ShoppingCart,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type SaleOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  total_amount: number;
  payment_method: string;
  status: string;
  item_count: number;
};

type PurchaseOrder = {
  id: string;
  created_at: string;
  supplier_name: string;
  product_name: string;
  quantity: number;
  total_cost: number;
  payment_method: string;
  received_by: string;
  status: string;
};

type SalesReturn = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  refund_amount: number;
  refund_method: string;
  reason: string;
  item_count: number;
  restocked: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const shortId = (id: string) => "#" + id.replace(/-/g, "").slice(0, 8).toUpperCase();

const PaymentIcon = ({ method }: { method: string }) => {
  const m = method?.toLowerCase() ?? "";
  if (m.includes("cash")) return <Banknote className="w-3.5 h-3.5 text-gray-500" />;
  if (m.includes("card")) return <CreditCard className="w-3.5 h-3.5 text-gray-500" />;
  return <Smartphone className="w-3.5 h-3.5 text-gray-500" />;
};

const SaleBadge = ({ status }: { status: string }) => {
  const s = status?.toLowerCase() ?? "completed";
  const styles: Record<string, string> = {
    completed: "bg-gray-100 text-gray-700",
    refunded: "bg-gray-900 text-white",
    pending: "bg-[#f3f0ea] text-yellow-800",
  };
  const icons: Record<string, React.ReactNode> = {
    completed: <CheckCircle2 className="w-3 h-3" />,
    refunded: <RotateCcw className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
  };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${styles[s] ?? styles.completed}`}>
      {icons[s] ?? icons.completed} {label}
    </span>
  );
};

const PurchaseBadge = ({ status }: { status: string }) => {
  const s = status?.toLowerCase() ?? "received";
  const styles: Record<string, string> = {
    received: "bg-gray-100 text-gray-700",
    pending: "bg-[#f3f0ea] text-yellow-800",
    cancelled: "bg-gray-900 text-white",
  };
  const icons: Record<string, React.ReactNode> = {
    received: <CheckCircle2 className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
    cancelled: <XCircle className="w-3 h-3" />,
  };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${styles[s] ?? styles.received}`}>
      {icons[s] ?? icons.received} {label}
    </span>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const supabase = createClient();
  const { role } = useAuth();

  const [activeTab, setActiveTab] = useState<"sales" | "returns" | "purchase">("sales");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All Payments");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Data
  const [salesOrders, setSalesOrders] = useState<SaleOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasePermissionError, setPurchasePermissionError] = useState(false);

  // ── Fetch Data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Sales: use select('*') to avoid errors if 'status' column doesn't exist yet
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.error("Error fetching orders:", ordersError.message);
      }

      if (ordersData && ordersData.length > 0) {
        // Get item counts per order — guard against empty array
        const orderIds = ordersData.map((o) => o.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from("order_items")
          .select("order_id, quantity")
          .in("order_id", orderIds);

        if (itemsError) {
          console.error("Error fetching order_items:", itemsError.message);
        }

        const countMap: Record<string, number> = {};
        if (itemsData) {
          for (const item of itemsData) {
            countMap[item.order_id] = (countMap[item.order_id] ?? 0) + (item.quantity ?? 1);
          }
        }

        const enriched = ordersData.map((o) => ({
          ...o,
          status: o.status ?? "Completed",
          item_count: countMap[o.id] ?? 0,
        }));
        setSalesOrders(enriched);
      } else if (ordersData) {
        // ordersData is [] (empty array) — no orders yet
        setSalesOrders([]);
      }

      // Sales Returns — from dedicated sales_returns table
      const { data: returnsData, error: returnsError } = await supabase
        .from("sales_returns")
        .select("*")
        .order("created_at", { ascending: false });

      if (returnsError) {
        console.warn("sales_returns not available yet:", returnsError.message);
      } else if (returnsData) {
        setSalesReturns(returnsData);
      }

      // Purchases — gracefully handle permission error if migration not run yet
      const { data: purchasesData, error: purchasesError } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (purchasesError) {
        if (purchasesError.message.toLowerCase().includes("permission") ||
            purchasesError.message.toLowerCase().includes("denied") ||
            purchasesError.message.toLowerCase().includes("does not exist")) {
          setPurchasePermissionError(true);
        }
        // Don't crash — just leave purchaseOrders as []
      } else {
        setPurchasePermissionError(false);
        if (purchasesData) setPurchaseOrders(purchasesData);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived stats ──
  const completedSales = salesOrders.filter(o => (o.status ?? "Completed").toLowerCase() !== "refunded");
  const refundedOrders = salesOrders.filter(o => (o.status ?? "").toLowerCase() === "refunded");
  // Merge: prefer sales_returns table, fall back to refundedOrders from orders.status
  const allReturns: SalesReturn[] = salesReturns.length > 0
    ? salesReturns
    : refundedOrders.map(o => ({
        id: o.id,
        created_at: o.created_at,
        customer_name: o.customer_name,
        customer_mobile: o.customer_mobile,
        refund_amount: o.total_amount,
        refund_method: o.payment_method,
        reason: "",
        item_count: o.item_count,
        restocked: false,
      }));
  const totalSalesAmount = completedSales.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const totalPurchasesAmount = purchaseOrders.reduce((a, o) => a + (o.total_cost ?? 0), 0);
  const totalRefundsAmount = allReturns.reduce((a, o) => a + (o.refund_amount ?? 0), 0);

  // ── Filtering & Sorting ──
  const filteredSales = completedSales
    .filter((o) => {
      const q = search.toLowerCase();
      const matchSearch = !q || o.customer_name?.toLowerCase().includes(q) || shortId(o.id).toLowerCase().includes(q);
      const matchPayment = paymentFilter === "All Payments" || o.payment_method?.toLowerCase().includes(paymentFilter.toLowerCase());
      return matchSearch && matchPayment;
    })
    .sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOrder === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortOrder === "highest") return b.total_amount - a.total_amount;
      return a.total_amount - b.total_amount;
    });

  const filteredReturns = allReturns
    .filter((o) => {
      const q = search.toLowerCase();
      return !q || o.customer_name?.toLowerCase().includes(q) || shortId(o.id).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOrder === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortOrder === "highest") return b.refund_amount - a.refund_amount;
      return a.refund_amount - b.refund_amount;
    });

  const filteredPurchases = purchaseOrders
    .filter((o) => {
      const q = search.toLowerCase();
      return !q || o.supplier_name?.toLowerCase().includes(q) || o.product_name?.toLowerCase().includes(q) || shortId(o.id).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOrder === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortOrder === "highest") return b.total_cost - a.total_cost;
      return a.total_cost - b.total_cost;
    });

  const activeData = activeTab === "sales" ? filteredSales : activeTab === "returns" ? filteredReturns : filteredPurchases;
  const totalPages = Math.max(1, Math.ceil(activeData.length / ITEMS_PER_PAGE));
  const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedReturns = filteredReturns.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedPurchases = filteredPurchases.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleTabChange = (tab: "sales" | "returns" | "purchase") => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearch("");
    setPaymentFilter("All Payments");
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8 no-scrollbar">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900">History</h1>
          <p className="text-sm text-gray-400 font-medium mt-0.5">Track all sales and purchase transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            This Month
          </button>
          <button className="flex items-center gap-2 bg-black px-4 py-2 rounded-lg text-sm font-semibold text-white hover:bg-gray-800 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {role !== "salesman" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div
          onClick={() => handleTabChange("sales")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 ${
            activeTab === "sales"
              ? "bg-gray-900 border-gray-900 text-white shadow-lg"
              : "bg-white border-gray-100 shadow-sm hover:border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Sales Revenue
            </span>
            <ShoppingCart className={`w-4 h-4 ${activeTab === "sales" ? "text-gray-500" : "text-gray-300"}`} />
          </div>
          <div className={`text-3xl font-black ${activeTab === "sales" ? "text-white" : "text-gray-900"}`}>
            {loading ? "—" : `৳ ${totalSalesAmount.toLocaleString()}`}
          </div>
          <div className={`text-xs font-semibold mt-1 ${activeTab === "sales" ? "text-gray-500" : "text-gray-400"}`}>
            {loading ? "Loading..." : `${completedSales.length} completed orders`}
          </div>
        </div>

        <div
          onClick={() => handleTabChange("returns")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 ${
            activeTab === "returns"
              ? "bg-gray-900 border-gray-900 text-white shadow-lg"
              : "bg-white border-gray-100 shadow-sm hover:border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Refunds
            </span>
            <RotateCcw className={`w-4 h-4 ${activeTab === "returns" ? "text-gray-500" : "text-gray-300"}`} />
          </div>
          <div className={`text-3xl font-black ${activeTab === "returns" ? "text-white" : "text-gray-900"}`}>
            {loading ? "—" : `৳ ${totalRefundsAmount.toLocaleString()}`}
          </div>
          <div className={`text-xs font-semibold mt-1 ${activeTab === "returns" ? "text-gray-500" : "text-gray-400"}`}>
            {loading ? "Loading..." : `${allReturns.length} refunded orders`}
          </div>
        </div>

        <div
          onClick={() => handleTabChange("purchase")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 ${
            activeTab === "purchase"
              ? "bg-gray-900 border-gray-900 text-white shadow-lg"
              : "bg-white border-gray-100 shadow-sm hover:border-gray-300"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Purchase Cost
            </span>
            <Package className={`w-4 h-4 ${activeTab === "purchase" ? "text-gray-500" : "text-gray-300"}`} />
          </div>
          <div className={`text-3xl font-black ${activeTab === "purchase" ? "text-white" : "text-gray-900"}`}>
            {loading ? "—" : `৳ ${totalPurchasesAmount.toLocaleString()}`}
          </div>
          <div className={`text-xs font-semibold mt-1 ${activeTab === "purchase" ? "text-gray-500" : "text-gray-400"}`}>
            {loading ? "Loading..." : `${purchaseOrders.length} stock purchase records`}
          </div>
        </div>
      </div>
      )}
      {/* ── Table Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Tabs */}
        <div className="flex items-center border-b border-gray-100 px-6 pt-5">
          <button
            onClick={() => handleTabChange("sales")}
            className={`pb-3 mr-6 text-sm font-bold border-b-2 transition-colors ${
              activeTab === "sales" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Sales History
          </button>
          <button
            onClick={() => handleTabChange("returns")}
            className={`pb-3 mr-6 text-sm font-bold border-b-2 transition-colors ${
              activeTab === "returns" ? "border-gray-900 text-gray-900" : "border-transparent text-red-400 hover:text-red-600"
            }`}
          >
            Sales Returns
            {refundedOrders.length > 0 || allReturns.length > 0 ? (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">
                {allReturns.length}
              </span>
            ) : null}
          </button>
          {role !== "salesman" && (
            <button
              onClick={() => handleTabChange("purchase")}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === "purchase" ? "border-gray-900 text-gray-900" : "border-transparent text-orange-400 hover:text-orange-600"
              }`}
            >
              Purchase History
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder={
                activeTab === "sales"
                  ? "Search customer name or order ID..."
                  : activeTab === "returns"
                  ? "Search customer name or order ID..."
                  : "Search supplier or product name..."
              }
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
            />
          </div>

          {/* Payment filter (sales only) */}
          {activeTab === "sales" && (
            <div className="relative">
              <select
                value={paymentFilter}
                onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
                className="appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 cursor-pointer"
              >
                <option>All Payments</option>
                <option>Cash</option>
                <option>Card</option>
                <option>Mobile</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Sort */}
          <div className="relative ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400 font-semibold">Sort by:</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
            <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-sm text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-gray-300" />
              Loading history...
            </div>
          ) : activeTab === "sales" ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["ORDER ID", "DATE & TIME", "CUSTOMER", "ITEMS", "TOTAL (৳)", "PAYMENT", "STATUS"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm text-gray-400">
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                      No sales orders found.
                    </td>
                  </tr>
                ) : (
                  paginatedSales.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-700 whitespace-nowrap">{shortId(order.id)}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-gray-700">{formatDate(order.created_at)}</div>
                        <div className="text-[11px] text-gray-400">{formatTime(order.created_at)}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-gray-800">{order.customer_name || "Guest"}</div>
                        <div className="text-[11px] text-gray-400">{order.customer_mobile || "—"}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-600">
                        {order.item_count} {order.item_count === 1 ? "item" : "items"}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-900 whitespace-nowrap">
                        ৳ {(order.total_amount ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                          <PaymentIcon method={order.payment_method} />
                          {order.payment_method}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <SaleBadge status={order.status ?? "Completed"} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : activeTab === "returns" ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["ORDER ID", "DATE & TIME", "CUSTOMER", "ITEMS", "REFUND (৳)", "PAYMENT", "STATUS"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedReturns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm text-gray-400">
                      <RotateCcw className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                      No sales returns yet. Process a return to see it here.
                    </td>
                  </tr>
                ) : (
                  paginatedReturns.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-700 whitespace-nowrap">{shortId(order.id)}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-gray-700">{formatDate(order.created_at)}</div>
                        <div className="text-[11px] text-gray-400">{formatTime(order.created_at)}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-gray-800">{order.customer_name || "Guest"}</div>
                        <div className="text-[11px] text-gray-400">{order.customer_mobile || "—"}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-600">
                        {order.item_count} {order.item_count === 1 ? "item" : "items"}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-900 whitespace-nowrap">
                        ৳ {(order.refund_amount ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                          <PaymentIcon method={order.refund_method} />
                          {order.refund_method}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white">
                          <RotateCcw className="w-3 h-3" /> Refunded
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["PO ID", "DATE & TIME", "SUPPLIER", "PRODUCT", "QTY", "TOTAL COST (৳)", "PAYMENT", "STATUS"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchasePermissionError ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10">
                      <div className="max-w-xl mx-auto bg-amber-50 border border-amber-200 rounded-2xl p-6">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Package className="w-4 h-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-900 mb-1">Database setup required</p>
                            <p className="text-xs text-amber-700 font-medium leading-relaxed">
                              The <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">purchase_orders</code> table doesn&apos;t have permissions yet.
                              Run the following SQL in your <strong>Supabase → SQL Editor</strong>:
                            </p>
                          </div>
                        </div>
                        <pre className="bg-white border border-amber-200 rounded-xl p-4 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">{`GRANT ALL ON TABLE public.purchase_orders TO anon;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO service_role;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.purchase_orders;
CREATE POLICY "allow_all_anon"
  ON public.purchase_orders FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);`}</pre>
                        <p className="text-[11px] text-amber-600 font-medium mt-3">💡 Select all the text above, paste it into Supabase SQL Editor, and click Run.</p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-sm text-gray-400">
                      <Package className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                      No purchase records yet. Add a product to get started.
                    </td>
                  </tr>
                ) : (
                  paginatedPurchases.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-700 whitespace-nowrap">{shortId(order.id)}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-gray-700">{formatDate(order.created_at)}</div>
                        <div className="text-[11px] text-gray-400">{formatTime(order.created_at)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-800">{order.supplier_name || "Unknown"}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 max-w-[160px] truncate">{order.product_name}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-600">{order.quantity}</td>
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-900 whitespace-nowrap">
                        ৳ {(order.total_cost ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                          <PaymentIcon method={order.payment_method} />
                          {order.payment_method}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <PurchaseBadge status={order.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-50">
            <span className="text-xs text-gray-400 font-semibold">
              {activeData.length === 0
                ? "No entries"
                : `Showing ${Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, activeData.length)}–${Math.min(
                    currentPage * ITEMS_PER_PAGE,
                    activeData.length
                  )} of ${activeData.length} entries`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="w-8 text-center text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                        currentPage === p
                          ? "bg-gray-900 text-white"
                          : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

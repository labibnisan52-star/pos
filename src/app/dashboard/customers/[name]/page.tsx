"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  MapPin,
  ShoppingBag,
  TrendingUp,
  Calendar,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  CheckCircle2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Star,
  Edit,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-amber-100 text-amber-800",
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-purple-100 text-purple-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
];

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const timeAgo = (iso: string | null) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const shortId = (id: string) => "#ORD-" + id.replace(/-/g, "").slice(0, 4).toUpperCase();

const PaymentIcon = ({ method }: { method: string }) => {
  const m = (method ?? "").toLowerCase();
  if (m.includes("cash")) return <Banknote className="w-4 h-4 text-gray-400" />;
  if (m.includes("card")) return <CreditCard className="w-4 h-4 text-gray-400" />;
  return <Smartphone className="w-4 h-4 text-gray-400" />;
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = (status ?? "completed").toLowerCase();
  const map: Record<string, { style: string; icon: React.ReactNode }> = {
    completed: { style: "bg-gray-100 text-gray-700", icon: <CheckCircle2 className="w-3 h-3" /> },
    refunded: { style: "bg-gray-900 text-white", icon: <RotateCcw className="w-3 h-3" /> },
    pending: { style: "bg-amber-50 text-amber-700", icon: <Clock className="w-3 h-3" /> },
  };
  const { style, icon } = map[s] ?? map.completed;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${style}`}>
      {icon} {(status ?? "Completed").charAt(0).toUpperCase() + (status ?? "Completed").slice(1)}
    </span>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Order = {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  status: string;
  item_count: number;
  customer_mobile?: string;
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  // Decode customer name from URL
  const customerName = decodeURIComponent(params.name as string);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const fetchOrders = useCallback(async () => {
    setLoading(true);

    const { data: ordersData, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_name", customerName)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching customer orders:", error.message);
      setLoading(false);
      return;
    }

    if (ordersData && ordersData.length > 0) {
      const orderIds = ordersData.map((o) => o.id);
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("order_id, quantity")
        .in("order_id", orderIds);

      const countMap: Record<string, number> = {};
      for (const item of itemsData ?? []) {
        countMap[item.order_id] = (countMap[item.order_id] ?? 0) + (item.quantity ?? 1);
      }

      setOrders(
        ordersData.map((o) => ({
          ...o,
          status: o.status ?? "Completed",
          item_count: countMap[o.id] ?? 0,
        }))
      );
    } else {
      setOrders([]);
    }

    setLoading(false);
  }, [supabase, customerName]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Derived stats ──
  const totalOrders = orders.filter(o => o.total_amount > 0).length;
  const lifetimeSpend = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(lifetimeSpend / totalOrders) : 0;
  const lastPurchase = orders[0]?.created_at ?? null;
  const firstOrder = orders[orders.length - 1]?.created_at ?? null;
  const mobile = orders[0]?.customer_mobile ?? "—";

  // Payment method frequency → "Favorite Payment"
  const paymentCount: Record<string, number> = {};
  for (const o of orders) {
    const m = o.payment_method ?? "Cash";
    paymentCount[m] = (paymentCount[m] ?? 0) + 1;
  }
  const favPayment = Object.entries(paymentCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // ── Sorted + Paginated orders ──
  const sorted = [...orders].sort((a, b) => {
    if (sortOrder === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortOrder === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortOrder === "highest") return b.total_amount - a.total_amount;
    return a.total_amount - b.total_amount;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const avatarColor = getAvatarColor(customerName);
  const initials = getInitials(customerName);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8 no-scrollbar">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span
            onClick={() => router.push("/dashboard/customers")}
            className="hover:text-gray-900 cursor-pointer transition-colors"
          >
            Customers
          </span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900">{customerName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>
      </div>

      {/* ── Profile + Stats Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        {/* Profile Card */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black mb-4 ${avatarColor}`}>
            {initials}
          </div>
          <h1 className="text-lg font-black text-gray-900 mb-3">{customerName}</h1>
          <div className="space-y-2 w-full">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Phone className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              <span className="font-medium">{mobile !== "—" ? mobile : "No phone"}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <MapPin className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              <span>Walk-in Customer</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Orders</span>
              <div className="w-8 h-8 bg-[#f3f0ea] rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-gray-700" />
              </div>
            </div>
            <div className="text-4xl font-black text-gray-900">{loading ? "—" : totalOrders}</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Lifetime Spend</span>
              <div className="w-8 h-8 bg-[#eaddc5] rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-amber-700" />
              </div>
            </div>
            <div className="text-3xl font-black text-gray-900">{loading ? "—" : `৳ ${lifetimeSpend.toLocaleString()}`}</div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Customer Since</span>
              <div className="w-8 h-8 bg-[#f3f0ea] rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-gray-700" />
              </div>
            </div>
            <div className="text-xl font-black text-gray-900">{loading ? "—" : formatDate(firstOrder)}</div>
          </div>
        </div>
      </div>

      {/* ── Secondary Stats Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Average Order Value</p>
            <p className="text-2xl font-black text-gray-900">{loading ? "—" : `৳ ${avgOrderValue.toLocaleString()}`}</p>
          </div>
          <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Last Purchase</p>
            <p className="text-lg font-black text-gray-900">{loading ? "—" : formatDate(lastPurchase)}</p>
            {lastPurchase && (
              <p className="text-xs text-gray-400 font-medium mt-0.5">{timeAgo(lastPurchase)}</p>
            )}
          </div>
          <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center">
            <Clock className="w-4 h-4 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Favourite Payment</p>
            <p className="text-lg font-black text-gray-900">{loading ? "—" : favPayment}</p>
          </div>
          <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center">
            <Star className="w-4 h-4 text-amber-400" />
          </div>
        </div>
      </div>

      {/* ── Purchase History Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Purchase History</h2>
          <div className="relative flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400">Sort by:</span>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value as typeof sortOrder); setCurrentPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="newest">Date (Newest)</option>
              <option value="oldest">Date (Oldest)</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
            <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading orders...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  {["Order ID", "Date", "Items", "Total", "Payment", "Status"].map((h) => (
                    <th
                      key={h}
                      className={`px-6 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                        h === "Total" || h === "Items" ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-sm text-gray-400">
                      No purchase history found for this customer.
                    </td>
                  </tr>
                ) : (
                  paginated.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-blue-600">{shortId(order.id)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-700 whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">
                        {order.item_count}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-gray-900 text-right whitespace-nowrap">
                        ৳ {(order.total_amount ?? 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <PaymentIcon method={order.payment_method} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={order.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && sorted.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-50">
            <span className="text-xs text-gray-400 font-semibold">
              Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, sorted.length)}–{Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)} of {sorted.length} orders
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
                    <span key={`e-${idx}`} className="w-8 text-center text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                        currentPage === p ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
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

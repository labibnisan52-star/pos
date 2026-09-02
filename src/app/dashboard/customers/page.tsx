"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Phone,
  ShoppingBag,
  TrendingUp,
  Users,
  UserPlus,
  Star,
  Calendar,
  X,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

// ─── Types ─────────────────────────────────────────────────────────────────

type Customer = {
  name: string;
  mobile: string;
  orderCount: number;
  totalSpend: number;
  lastPurchase: string | null;
  initials: string;
  avatarColor: string;
};

// ─── Avatar Colors (deterministic by name) ─────────────────────────────────

const AVATAR_COLORS = [
  "bg-amber-100 text-amber-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ─── Add Customer Modal ────────────────────────────────────────────────────

function AddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) { setName(""); setMobile(""); setError(""); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) { setError("Customer name is required."); return; }
    setLoading(true);
    setError("");

    // Insert a dummy "customer seed" order with ৳0 to register them
    const { error: err } = await supabase.from("orders").insert([{
      customer_name: name.trim(),
      customer_mobile: mobile.trim() || "",
      total_amount: 0,
      payment_method: "Cash",
    }]);

    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      setLoading(false);
      onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add New Customer</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Avatar Preview */}
          <div className="flex justify-center mb-2">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-black ${name ? getAvatarColor(name) : "bg-gray-100 text-gray-400"}`}>
              {name ? getInitials(name) : <Users className="w-7 h-7" />}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sarah Jenkins"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+880 1XX XXX XXXX"
                className="w-full pl-9 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors text-sm">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 rounded-xl font-semibold text-white bg-gray-900 hover:bg-gray-700 transition-colors text-sm disabled:opacity-50"
          >
            {loading ? "Saving..." : "Add Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const supabase = createClient();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"spend" | "orders" | "recent" | "name">("spend");
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const ITEMS_PER_PAGE = 8;

  // ── Fetch & aggregate customers from orders ──
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("customer_name, customer_mobile, total_amount, created_at");

    if (error) {
      console.error("Error fetching customers:", error.message);
      setLoading(false);
      return;
    }

    // Aggregate by customer_name + mobile
    const map = new Map<string, Customer>();
    for (const order of data ?? []) {
      const key = (order.customer_name || "Guest").trim();
      if (key === "Guest" && !order.customer_mobile) continue; // skip anonymous
      const existing = map.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpend += order.total_amount ?? 0;
        if (order.created_at && (!existing.lastPurchase || order.created_at > existing.lastPurchase)) {
          existing.lastPurchase = order.created_at;
        }
      } else {
        map.set(key, {
          name: key,
          mobile: order.customer_mobile || "—",
          orderCount: 1,
          totalSpend: order.total_amount ?? 0,
          lastPurchase: order.created_at,
          initials: getInitials(key),
          avatarColor: getAvatarColor(key),
        });
      }
    }

    setCustomers(Array.from(map.values()));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // ── Derived stats ──
  const totalCustomers = customers.length;
  const topSpender = customers.reduce<Customer | null>((top, c) => (!top || c.totalSpend > top.totalSpend ? c : top), null);

  // New this month
  const thisMonth = new Date();
  const newThisMonth = customers.filter((c) => {
    if (!c.lastPurchase) return false;
    const d = new Date(c.lastPurchase);
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
  }).length;

  // ── Filter + Sort ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      .sort((a, b) => {
        if (sortBy === "spend") return b.totalSpend - a.totalSpend;
        if (sortBy === "orders") return b.orderCount - a.orderCount;
        if (sortBy === "recent") return (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? "");
        return a.name.localeCompare(b.name);
      });
  }, [customers, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8 no-scrollbar">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Customers</h1>
          <p className="text-sm text-gray-400 font-medium mt-0.5">Manage and track your customer base</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCustomers}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-gray-900 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Customers</span>
            <div className="w-8 h-8 bg-[#f3f0ea] rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-gray-700" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900">{loading ? "—" : totalCustomers.toLocaleString()}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">New This Month</span>
            <div className="w-8 h-8 bg-[#f3f0ea] rounded-lg flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-gray-700" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900">{loading ? "—" : newThisMonth}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Top Spender</span>
            <div className="w-8 h-8 bg-[#eaddc5] rounded-lg flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-700" />
            </div>
          </div>
          {topSpender ? (
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-black text-gray-900">৳{topSpender.totalSpend.toLocaleString()}</div>
              <div className="text-xs font-semibold text-gray-500 truncate">{topSpender.name.split(" ")[0]} {topSpender.name.split(" ")[1]?.[0]}.</div>
            </div>
          ) : (
            <div className="text-2xl font-black text-gray-300">—</div>
          )}
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search name or phone..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400">Sort by:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setCurrentPage(1); }}
                className="appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none cursor-pointer"
              >
                <option value="spend">Highest Spend</option>
                <option value="orders">Most Orders</option>
                <option value="recent">Most Recent</option>
                <option value="name">Name A–Z</option>
              </select>
              <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-sm text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-gray-300" />
              Loading customers...
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Customer", "Phone", "Orders", "Total Spend", "Last Purchase", "Actions"].map((h) => (
                    <th
                      key={h}
                      className={`px-6 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                        h === "Total Spend" || h === "Orders" ? "text-right" : "text-left"
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
                    <td colSpan={6} className="px-6 py-16 text-center text-sm text-gray-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                      {search ? "No customers match your search." : "No customers yet. Complete a sale to see customers here."}
                    </td>
                  </tr>
                ) : (
                  paginated.map((c, idx) => (
                    <tr
                      key={`${c.name}-${idx}`}
                      onClick={() => router.push(`/dashboard/customers/${encodeURIComponent(c.name)}`)}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors group cursor-pointer"
                    >
                      {/* Customer */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${c.avatarColor}`}>
                            {c.initials}
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                        </div>
                      </td>
                      {/* Phone */}
                      <td className="px-6 py-4 text-sm text-gray-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-300" />
                          {c.mobile}
                        </div>
                      </td>
                      {/* Orders */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-gray-800">
                          <ShoppingBag className="w-3.5 h-3.5 text-gray-300" />
                          {c.orderCount}
                        </div>
                      </td>
                      {/* Total Spend */}
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-gray-900">৳{c.totalSpend.toLocaleString()}</span>
                      </td>
                      {/* Last Purchase */}
                      <td className="px-6 py-4 text-sm text-gray-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-300" />
                          {formatDate(c.lastPurchase)}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/customers/${encodeURIComponent(c.name)}`); }}
                            className="px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-gray-700 text-white rounded-lg transition-colors"
                          >
                            View →
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-50">
            <span className="text-xs text-gray-400 font-semibold">
              Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filtered.length)}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} customers
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

      <AddCustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchCustomers}
      />
    </div>
  );
}

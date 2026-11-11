"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Phone,
  ShoppingBag,
  Users,
  UserPlus,
  Star,
  Calendar,
  X,
  RefreshCw,
  Coins,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { formatBDT, roundMoney } from "@/lib/calculations";

type Customer = {
  name: string;
  mobile: string;
  orderCount: number;
  totalSpend: number;
  totalDue: number;
  lastPurchase: string | null;
  initials: string;
  avatarColor: string;
};

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
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "CU";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function AddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName("");
      setMobile("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setLoading(true);
    setError("");

    const { error: err } = await supabase.from("customers").insert([
      {
        name: name.trim(),
        mobile: mobile.trim(),
      },
    ]);

    if (err) {
      if (err.message.includes("customers")) {
        setError(
          "Please run 12_pos_overhaul.sql in Supabase SQL Editor to create the customers table."
        );
      } else {
        setError(err.message);
      }
      setLoading(false);
      return;
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add New Customer</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="flex justify-center">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-black ${
                name ? getAvatarColor(name) : "bg-gray-100 text-gray-400"
              }`}
            >
              {name ? getInitials(name) : <Users className="w-6 h-6" />}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter full name"
              required
              className="w-full min-h-[46px] px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
              Mobile Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                inputMode="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full min-h-[46px] pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-h-[46px] py-2.5 rounded-xl font-bold text-white bg-black hover:bg-gray-800 text-sm disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<
    "spend" | "due" | "orders" | "recent" | "name"
  >("spend");
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const ITEMS_PER_PAGE = 10;

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, ordersRes] = await Promise.all([
        supabase.from("customers").select("name, mobile, created_at"),
        supabase
          .from("orders")
          .select(
            "customer_name, customer_mobile, subtotal, grand_total, total_amount, due_amount, status, created_at"
          ),
      ]);

      const map = new Map<string, Customer>();

      // 1. Seed from dedicated customers table
      for (const c of custRes.data || []) {
        const cleanName = (c.name || "").trim();
        if (!cleanName) continue;
        const normKey = cleanName.toLowerCase();
        map.set(normKey, {
          name: cleanName,
          mobile: c.mobile || "—",
          orderCount: 0,
          totalSpend: 0,
          totalDue: 0,
          lastPurchase: null,
          initials: getInitials(cleanName),
          avatarColor: getAvatarColor(cleanName),
        });
      }

      // 2. Aggregate real orders
      for (const order of ordersRes.data || []) {
        const rawName = (order.customer_name || "").trim();
        const lower = rawName.toLowerCase();
        if (
          !rawName ||
          ((lower === "guest" || lower === "walk-in customer") &&
            !order.customer_mobile)
        ) {
          continue;
        }
        if (order.status === "Cancelled") continue;

        const orderTotal =
          order.grand_total !== null &&
          order.grand_total !== undefined &&
          (Number(order.grand_total) > 0 || Number(order.subtotal) > 0)
            ? Number(order.grand_total)
            : Number(order.total_amount) || 0;

        // Ignore legacy ৳0 dummy customer-seed rows when counting real orders
        const isRealSale = orderTotal > 0 || Number(order.subtotal) > 0;
        const due =
          order.status === "Refunded" ? 0 : Number(order.due_amount) || 0;

        const existing = map.get(lower);
        if (existing) {
          if (isRealSale) {
            existing.orderCount += 1;
            existing.totalSpend = roundMoney(existing.totalSpend + orderTotal);
            if (
              order.created_at &&
              (!existing.lastPurchase ||
                order.created_at > existing.lastPurchase)
            ) {
              existing.lastPurchase = order.created_at;
            }
          }
          existing.totalDue = roundMoney(existing.totalDue + due);
          if (existing.mobile === "—" && order.customer_mobile) {
            existing.mobile = order.customer_mobile;
          }
        } else {
          map.set(lower, {
            name: rawName,
            mobile: order.customer_mobile || "—",
            orderCount: isRealSale ? 1 : 0,
            totalSpend: isRealSale ? roundMoney(orderTotal) : 0,
            totalDue: roundMoney(due),
            lastPurchase: isRealSale ? order.created_at : null,
            initials: getInitials(rawName),
            avatarColor: getAvatarColor(rawName),
          });
        }
      }

      setCustomers(Array.from(map.values()));
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const totalCustomers = customers.length;
  const totalOutstandingDue = roundMoney(
    customers.reduce((s, c) => s + c.totalDue, 0)
  );
  const topSpender = customers.reduce<Customer | null>(
    (top, c) =>
      c.totalSpend > 0 && (!top || c.totalSpend > top.totalSpend) ? c : top,
    null
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.mobile.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortBy === "spend") return b.totalSpend - a.totalSpend;
        if (sortBy === "due") return b.totalDue - a.totalDue;
        if (sortBy === "orders") return b.orderCount - a.orderCount;
        if (sortBy === "recent")
          return (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? "");
        return a.name.localeCompare(b.name);
      });
  }, [customers, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Customers
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
            Customer directory, purchase history, and credit dues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchCustomers}
            className="min-h-[44px] flex items-center gap-2 bg-white border border-gray-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw
              className={`w-4 h-4 text-gray-400 ${
                loading ? "animate-spin" : ""
              }`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="min-h-[44px] flex items-center gap-2 bg-black px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Customers
            </span>
            <Users className="w-4 h-4 text-gray-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            {loading ? "—" : totalCustomers}
          </div>
        </div>

        <Link
          href="/dashboard/dues"
          className="bg-white p-5 rounded-2xl border border-gray-200/80 hover:border-amber-300 hover:shadow-2xs transition-all group block"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-amber-800 transition-colors">
              Total Credit Dues
            </span>
            <Coins className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-700">
            {loading ? "—" : `৳${formatBDT(totalOutstandingDue)}`}
          </div>
          <span className="text-[11px] font-bold text-amber-800 group-hover:underline flex items-center gap-0.5 mt-1">
            Manage Dues →
          </span>
        </Link>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Top Customer
            </span>
            <Star className="w-4 h-4 text-amber-600" />
          </div>
          {topSpender ? (
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-xl sm:text-2xl font-black text-gray-900 shrink-0">
                ৳{formatBDT(topSpender.totalSpend)}
              </span>
              <span className="text-xs font-semibold text-gray-500 truncate">
                {topSpender.name}
              </span>
            </div>
          ) : (
            <div className="text-2xl font-black text-gray-300">—</div>
          )}
        </div>
      </div>

      {/* Main List / Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-4 sm:px-6 py-4 border-b border-gray-100">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search customer name or phone..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as typeof sortBy);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto min-h-[44px] appearance-none pl-3.5 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer"
            >
              <option value="spend">Highest Spend</option>
              <option value="due">Highest Due</option>
              <option value="orders">Most Orders</option>
              <option value="recent">Most Recent</option>
              <option value="name">Name A–Z</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
            Loading customers...
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-16 px-6 text-center text-sm text-gray-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            {search
              ? "No customers match your search."
              : "No customers yet. Add a customer or complete a named sale."}
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-gray-100">
              {paginated.map((c, idx) => (
                <button
                  key={`${c.name}-${idx}`}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/dashboard/customers/${encodeURIComponent(c.name)}`
                    )
                  }
                  className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${c.avatarColor}`}
                    >
                      {c.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {c.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {c.mobile} • {c.orderCount} orders
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-gray-900">
                      ৳{formatBDT(c.totalSpend)}
                    </p>
                    {c.totalDue > 0 && (
                      <p className="text-[11px] font-bold text-amber-700">
                        Due: ৳{formatBDT(c.totalDue)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      "Customer",
                      "Phone",
                      "Orders",
                      "Total Spend",
                      "Due Balance",
                      "Last Purchase",
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-6 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                          h === "Total Spend" ||
                          h === "Orders" ||
                          h === "Due Balance"
                            ? "text-right"
                            : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c, idx) => (
                    <tr
                      key={`${c.name}-${idx}`}
                      onClick={() =>
                        router.push(
                          `/dashboard/customers/${encodeURIComponent(c.name)}`
                        )
                      }
                      className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${c.avatarColor}`}
                          >
                            {c.initials}
                          </div>
                          <span className="text-sm font-bold text-gray-900">
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span>{c.mobile}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-gray-800">
                          <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                          <span>{c.orderCount}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-gray-900">
                          ৳{formatBDT(c.totalSpend)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-bold ${
                            c.totalDue > 0 ? "text-amber-700" : "text-gray-400"
                          }`}
                        >
                          {c.totalDue > 0 ? `৳${formatBDT(c.totalDue)}` : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formatDate(c.lastPurchase)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-semibold">
              Showing{" "}
              {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filtered.length)}
              –{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs font-bold text-gray-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
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

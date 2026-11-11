"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Coins,
  Search,
  Filter,
  ArrowUpDown,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Printer,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Users,
  ShoppingBag,
  CreditCard,
  Banknote,
  Smartphone,
  Eye,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { formatBDT, roundMoney } from "@/lib/calculations";
import CollectDueModal, { CollectDueOrder } from "@/components/CollectDueModal";
import ReceiptModal, { ReceiptOrderData } from "@/components/ReceiptModal";

type DueOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  subtotal?: number;
  discount_type?: string;
  discount_value?: number;
  discount_amount?: number;
  grand_total?: number;
  total_amount: number;
  amount_received?: number;
  paid_amount?: number;
  change?: number;
  due_amount?: number;
  payment_status?: string;
  payment_method: string;
  status: string;
  item_count?: number;
};

type CustomerDueSummary = {
  customer_name: string;
  customer_mobile: string;
  total_due: number;
  total_bill: number;
  total_paid: number;
  order_count: number;
  last_order_date: string;
  orders: DueOrder[];
};

const formatDate = (iso: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const shortId = (id: string) =>
  "#" + id.replace(/-/g, "").slice(0, 8).toUpperCase();

const getOrderTotal = (o: DueOrder): number => {
  if (
    o.grand_total !== undefined &&
    o.grand_total !== null &&
    (Number(o.grand_total) > 0 || Number(o.subtotal) > 0)
  ) {
    return Number(o.grand_total);
  }
  return Number(o.total_amount) || 0;
};

export default function DuesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [orders, setOrders] = useState<DueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all_dues" | "partial" | "unpaid" | "settled"
  >("all_dues");
  const [viewMode, setViewMode] = useState<"orders" | "customers">("orders");
  const [sortOrder, setSortOrder] = useState<"highest" | "oldest" | "newest">(
    "highest"
  );
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Modals state
  const [selectedOrderForDue, setSelectedOrderForDue] =
    useState<CollectDueOrder | null>(null);
  const [collectMode, setCollectMode] = useState<"partial" | "full">("partial");
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrderData | null>(
    null
  );
  const [successToast, setSuccessToast] = useState<{
    message: string;
    receipt?: ReceiptOrderData;
  } | null>(null);

  // Fetch all orders with due or payment info
  const fetchDuesData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .not("status", "in", '("Refunded","Cancelled")')
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching due orders:", error.message);
        return;
      }

      setOrders((data || []) as DueOrder[]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDuesData();
  }, [fetchDuesData]);

  // Overall Global Stats
  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let pendingCount = 0;
    const customerSet = new Set<string>();

    for (const o of orders) {
      const due = Number(o.due_amount) || 0;
      if (due > 0) {
        totalOutstanding += due;
        pendingCount += 1;
        const name = (o.customer_name || "").trim().toLowerCase();
        if (name) customerSet.add(name);
      }
    }

    return {
      totalOutstanding: roundMoney(totalOutstanding),
      pendingCount,
      uniqueCustomersCount: customerSet.size,
    };
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const due = Number(o.due_amount) || 0;
      const status = o.payment_status || (due > 0 ? "Partial" : "Paid");

      // Filter tab
      if (statusFilter === "all_dues" && due <= 0) return false;
      if (statusFilter === "partial" && (due <= 0 || status === "Unpaid"))
        return false;
      if (statusFilter === "unpaid" && status !== "Unpaid") return false;
      if (statusFilter === "settled" && due > 0) return false;

      // Search term
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (o.customer_name || "").toLowerCase().includes(q);
        const mobileMatch = (o.customer_mobile || "").includes(q);
        const idMatch = o.id.toLowerCase().includes(q);
        if (!nameMatch && !mobileMatch && !idMatch) return false;
      }

      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  // Sorted orders list
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const dueA = Number(a.due_amount) || 0;
      const dueB = Number(b.due_amount) || 0;
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();

      if (sortOrder === "highest") return dueB - dueA;
      if (sortOrder === "oldest") return dateA - dateB;
      return dateB - dateA;
    });
  }, [filteredOrders, sortOrder]);

  // Customer grouped view
  const customerSummaries = useMemo<CustomerDueSummary[]>(() => {
    const map = new Map<string, CustomerDueSummary>();

    for (const o of orders) {
      const due = Number(o.due_amount) || 0;
      if (statusFilter !== "settled" && due <= 0) continue;

      const custName = (o.customer_name || "Walk-in Customer").trim();
      const key = custName.toLowerCase();
      const total = getOrderTotal(o);
      const paid = Number(o.paid_amount || o.amount_received) || 0;

      if (!map.has(key)) {
        map.set(key, {
          customer_name: custName,
          customer_mobile: o.customer_mobile || "",
          total_due: due,
          total_bill: total,
          total_paid: paid,
          order_count: 1,
          last_order_date: o.created_at,
          orders: [o],
        });
      } else {
        const item = map.get(key)!;
        item.total_due = roundMoney(item.total_due + due);
        item.total_bill = roundMoney(item.total_bill + total);
        item.total_paid = roundMoney(item.total_paid + paid);
        item.order_count += 1;
        if (!item.customer_mobile && o.customer_mobile) {
          item.customer_mobile = o.customer_mobile;
        }
        item.orders.push(o);
      }
    }

    let arr = Array.from(map.values());

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      arr = arr.filter(
        (c) =>
          c.customer_name.toLowerCase().includes(q) ||
          c.customer_mobile.includes(q)
      );
    }

    arr.sort((a, b) => {
      if (sortOrder === "highest") return b.total_due - a.total_due;
      return b.order_count - a.order_count;
    });

    return arr;
  }, [orders, statusFilter, searchQuery, sortOrder]);

  // Pagination for order view
  const totalPages = Math.max(
    1,
    Math.ceil(sortedOrders.length / ITEMS_PER_PAGE)
  );
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedOrders, currentPage]);

  const handleOpenCollectDue = (
    order: DueOrder,
    mode: "partial" | "full" = "partial"
  ) => {
    setSelectedOrderForDue({
      id: order.id,
      created_at: order.created_at,
      customer_name: order.customer_name,
      customer_mobile: order.customer_mobile,
      grand_total: getOrderTotal(order),
      paid_amount: Number(order.paid_amount || order.amount_received) || 0,
      due_amount: Number(order.due_amount) || 0,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
    });
    setCollectMode(mode);
    setIsCollectModalOpen(true);
  };

  const handlePaymentSuccess = (updatedOrder: any, paymentDetails: any) => {
    // Refresh table
    fetchDuesData();

    // Show toast with receipt action
    setSuccessToast({
      message: `Successfully collected ৳${formatBDT(
        paymentDetails.amount_paid
      )} from ${updatedOrder.customer_name}! Remaining due: ৳${formatBDT(
        paymentDetails.remaining_due
      )}.`,
      receipt: updatedOrder,
    });

    // Auto clear toast after 8 seconds
    setTimeout(() => {
      setSuccessToast((prev) => (prev?.receipt === updatedOrder ? null : prev));
    }, 8000);
  };

  const handleViewReceipt = async (order: DueOrder) => {
    // Fetch items for receipt
    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

    const formattedItems = (items || []).map((it: any) => ({
      name: it.product_name || it.name || "Product Item",
      variant_label: it.variant_label || null,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_selling_price || it.unit_price) || 0,
      line_total: Number(it.line_total || it.total_price) || 0,
    }));

    setReceiptOrder({
      id: order.id,
      created_at: order.created_at,
      customer_name: order.customer_name || "Customer",
      customer_mobile: order.customer_mobile || "",
      payment_method: order.payment_method || "Cash",
      subtotal: Number(order.subtotal) || 0,
      discount_type: (order.discount_type as any) || "fixed",
      discount_value: Number(order.discount_value) || 0,
      discount_amount: Number(order.discount_amount) || 0,
      grand_total: getOrderTotal(order),
      amount_received: Number(order.amount_received) || 0,
      paid_amount: Number(order.paid_amount || order.amount_received) || 0,
      change: Number(order.change) || 0,
      due_amount: Number(order.due_amount) || 0,
      payment_status: (order.payment_status as any) || "Paid",
      items: formattedItems,
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">
            <Coins className="w-4 h-4" />
            <span>Accounts Receivable</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
            Customer Dues Management
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
            Track customer balances, collect partial or full dues, and issue payment receipts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDuesData}
            aria-label="Refresh dues list"
            className="min-h-[42px] px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link
            href="/dashboard/pos"
            className="min-h-[42px] px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Open POS</span>
          </Link>
        </div>
      </div>

      {/* Success Notification Toast with Quick Print Receipt */}
      {successToast && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-xs sm:text-sm font-bold text-emerald-900">
              {successToast.message}
            </p>
          </div>
          {successToast.receipt && (
            <button
              type="button"
              onClick={() => setReceiptOrder(successToast.receipt!)}
              className="min-h-[38px] px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Updated Receipt</span>
            </button>
          )}
        </div>
      )}

      {/* Primary KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Total Outstanding Dues */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Total Outstanding Due
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-200/80 text-amber-700">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-700">
            ৳{formatBDT(stats.totalOutstanding)}
          </div>
          <p className="text-[11px] text-gray-400 font-semibold mt-1">
            Across all active customer orders
          </p>
        </div>

        {/* Customers with Dues */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Customers With Due
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-200/80 text-blue-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            {stats.uniqueCustomersCount}
          </div>
          <p className="text-[11px] text-gray-400 font-semibold mt-1">
            Distinct customers with unpaid balance
          </p>
        </div>

        {/* Total Pending Due Orders */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Pending Due Orders
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-200/80 text-purple-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            {stats.pendingCount}
          </div>
          <p className="text-[11px] text-gray-400 font-semibold mt-1">
            Orders awaiting settlement
          </p>
        </div>
      </div>

      {/* Search, Tabs & View Controls */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 mb-6 space-y-4 shadow-2xs">
        {/* Top Controls Row */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by customer name, mobile phone, or order ID..."
              className="w-full min-h-[44px] pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-black transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Orders vs Customers */}
            <div className="bg-gray-100 p-1 rounded-xl flex items-center text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode("orders")}
                className={`min-h-[36px] px-3.5 rounded-lg transition-all ${
                  viewMode === "orders"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                By Order
              </button>
              <button
                type="button"
                onClick={() => setViewMode("customers")}
                className={`min-h-[36px] px-3.5 rounded-lg transition-all ${
                  viewMode === "customers"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                By Customer
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="min-h-[42px] appearance-none pl-3.5 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none cursor-pointer"
              >
                <option value="highest">Highest Due First</option>
                <option value="oldest">Oldest Due First</option>
                <option value="newest">Newest Due First</option>
              </select>
              <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100">
          {[
            { id: "all_dues", label: "Active Dues" },
            { id: "partial", label: "Partial Due" },
            { id: "unpaid", label: "Fully Unpaid" },
            { id: "settled", label: "Settled / History" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id as any);
                setCurrentPage(1);
              }}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? "bg-black text-white shadow-2xs"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content: Orders View or Customer Grouped View */}
      {viewMode === "orders" ? (
        /* ================= ORDER-BASED LIST ================= */
        <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-2xs">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-sm font-bold text-gray-900">
              Due Orders ({sortedOrders.length})
            </h2>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Loading dues data...</span>
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="py-16 px-4 text-center text-sm text-gray-400">
              No orders found matching this filter.
            </div>
          ) : (
            <>
              {/* Mobile Card List */}
              <div className="md:hidden divide-y divide-gray-100">
                {paginatedOrders.map((order) => {
                  const total = getOrderTotal(order);
                  const paid =
                    Number(order.paid_amount || order.amount_received) || 0;
                  const due = Number(order.due_amount) || 0;

                  return (
                    <div key={order.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black font-mono text-gray-900">
                              {shortId(order.id)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                due > 0
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {due > 0 ? "Due Active" : "Paid"}
                            </span>
                          </div>
                          <Link
                            href={`/dashboard/customers/${encodeURIComponent(
                              order.customer_name || "Customer"
                            )}`}
                            className="text-sm font-black text-gray-900 hover:underline block mt-0.5"
                          >
                            {order.customer_name || "Walk-in Customer"}
                          </Link>
                          {order.customer_mobile && (
                            <a
                              href={`tel:${order.customer_mobile}`}
                              className="text-xs text-gray-500 font-mono flex items-center gap-1 mt-0.5"
                            >
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span>{order.customer_mobile}</span>
                            </a>
                          )}
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {formatDate(order.created_at)}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase text-gray-400 block">
                            Due Amount
                          </span>
                          <span
                            className={`text-lg font-black ${
                              due > 0 ? "text-amber-700" : "text-gray-900"
                            }`}
                          >
                            {due > 0 ? `৳${formatBDT(due)}` : "৳0"}
                          </span>
                          <span className="text-[11px] text-gray-500 block">
                            of ৳{formatBDT(total)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(order)}
                          className="min-h-[38px] px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>

                        {due > 0 ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <button
                              type="button"
                              onClick={() => handleOpenCollectDue(order, "partial")}
                              className="min-h-[38px] flex-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pay Partial</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCollectDue(order, "full")}
                              className="min-h-[38px] flex-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Settle Full</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-[#faf9f6]/60">
                      {[
                        "Order ID",
                        "Customer",
                        "Date",
                        "Total Bill",
                        "Paid",
                        "Remaining Due",
                        "Status",
                        "Action",
                      ].map((h) => (
                        <th
                          key={h}
                          className={`px-5 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider ${
                            h === "Total Bill" ||
                            h === "Paid" ||
                            h === "Remaining Due"
                              ? "text-right"
                              : h === "Action"
                              ? "text-center"
                              : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => {
                      const total = getOrderTotal(order);
                      const paid =
                        Number(order.paid_amount || order.amount_received) || 0;
                      const due = Number(order.due_amount) || 0;

                      return (
                        <tr
                          key={order.id}
                          className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors"
                        >
                          {/* Order ID */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="text-xs font-bold font-mono text-gray-900 block">
                              {shortId(order.id)}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {order.payment_method || "Cash"}
                            </span>
                          </td>

                          {/* Customer */}
                          <td className="px-5 py-4">
                            <Link
                              href={`/dashboard/customers/${encodeURIComponent(
                                order.customer_name || "Customer"
                              )}`}
                              className="text-sm font-bold text-gray-900 hover:underline block truncate max-w-[180px]"
                            >
                              {order.customer_name || "Walk-in Customer"}
                            </Link>
                            {order.customer_mobile ? (
                              <a
                                href={`tel:${order.customer_mobile}`}
                                className="text-xs text-gray-500 font-mono hover:text-black flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3 text-gray-400" />
                                <span>{order.customer_mobile}</span>
                              </a>
                            ) : (
                              <span className="text-[11px] text-gray-400">
                                No phone
                              </span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="px-5 py-4 text-xs font-semibold text-gray-600 whitespace-nowrap">
                            {formatDate(order.created_at)}
                          </td>

                          {/* Total Bill */}
                          <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-bold text-gray-800">
                            ৳{formatBDT(total)}
                          </td>

                          {/* Paid */}
                          <td className="px-5 py-4 text-right whitespace-nowrap text-xs font-bold text-gray-600">
                            ৳{formatBDT(paid)}
                          </td>

                          {/* Due */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <span
                              className={`text-sm font-black ${
                                due > 0 ? "text-amber-700" : "text-gray-400"
                              }`}
                            >
                              {due > 0 ? `৳${formatBDT(due)}` : "—"}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {due > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3" /> Due Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3" /> Settled
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {due > 0 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollectDue(order, "partial")}
                                    className="min-h-[34px] px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all"
                                    title="Pay Partial Due"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Pay Partial</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollectDue(order, "full")}
                                    className="min-h-[34px] px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all"
                                    title="Settle Full Due"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Settle Full</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleViewReceipt(order)}
                                  className="min-h-[36px] px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                                  title="View Receipt"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  <span>Receipt</span>
                                </button>
                              )}

                              {due > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleViewReceipt(order)}
                                  className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs transition-colors"
                                  title="View Receipt"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination */}
          {!loading && sortedOrders.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
              <span className="text-xs text-gray-500 font-semibold">
                Showing{" "}
                {Math.min(
                  (currentPage - 1) * ITEMS_PER_PAGE + 1,
                  sortedOrders.length
                )}
                –{Math.min(currentPage * ITEMS_PER_PAGE, sortedOrders.length)} of{" "}
                {sortedOrders.length} orders
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
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
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================= CUSTOMER GROUPED LIST ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customerSummaries.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl border border-gray-200/80 p-12 text-center text-sm text-gray-400">
              No customer dues found matching criteria.
            </div>
          ) : (
            customerSummaries.map((cust) => {
              const oldestDueOrder = cust.orders.find(
                (o) => (Number(o.due_amount) || 0) > 0
              );

              return (
                <div
                  key={cust.customer_name}
                  className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-2xs flex flex-col justify-between space-y-4 hover:border-black/30 transition-all"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/customers/${encodeURIComponent(
                            cust.customer_name
                          )}`}
                          className="text-base font-black text-gray-900 hover:underline block truncate"
                        >
                          {cust.customer_name}
                        </Link>
                        {cust.customer_mobile ? (
                          <a
                            href={`tel:${cust.customer_mobile}`}
                            className="text-xs text-gray-500 font-mono flex items-center gap-1 mt-0.5"
                          >
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>{cust.customer_mobile}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-400">
                            No phone saved
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg text-[11px] font-bold shrink-0">
                        {cust.order_count} orders
                      </span>
                    </div>

                    <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1.5 my-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">
                          Total Purchases:
                        </span>
                        <span className="font-bold text-gray-900">
                          ৳{formatBDT(cust.total_bill)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 font-medium">
                          Already Paid:
                        </span>
                        <span className="font-bold text-gray-900">
                          ৳{formatBDT(cust.total_paid)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-amber-200/80">
                        <span className="font-bold text-amber-900 uppercase tracking-wide">
                          Total Due:
                        </span>
                        <span className="text-lg font-black text-amber-800">
                          ৳{formatBDT(cust.total_due)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                    <Link
                      href={`/dashboard/customers/${encodeURIComponent(
                        cust.customer_name
                      )}`}
                      className="min-h-[38px] px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <span>Profile</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>

                    {oldestDueOrder && cust.total_due > 0 ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <button
                          type="button"
                          onClick={() => handleOpenCollectDue(oldestDueOrder, "partial")}
                          className="min-h-[38px] flex-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pay Partial</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCollectDue(oldestDueOrder, "full")}
                          className="min-h-[38px] flex-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Settle Full</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 ml-auto">
                        <CheckCircle2 className="w-3.5 h-3.5" /> All Settled
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Collect Due Modal */}
      <CollectDueModal
        isOpen={isCollectModalOpen}
        onClose={() => {
          setIsCollectModalOpen(false);
          setSelectedOrderForDue(null);
        }}
        order={selectedOrderForDue}
        initialMode={collectMode}
        onSuccess={handlePaymentSuccess}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
        title="Payment Receipt"
        primaryActionLabel="Print Receipt"
      />
    </div>
  );
}


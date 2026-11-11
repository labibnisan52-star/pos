"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
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
  Printer,
  Coins,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  calculateLineTotal,
  DiscountType,
  formatBDT,
  PaymentStatus,
  roundMoney,
} from "@/lib/calculations";
import ReceiptModal, { ReceiptOrderData } from "@/components/ReceiptModal";
import CollectDueModal, { CollectDueOrder } from "@/components/CollectDueModal";

type SaleOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_mobile: string;
  subtotal?: number;
  discount_type?: string;
  discount_value?: number;
  discount_amount?: number;
  discount?: number;
  grand_total?: number;
  total_amount: number;
  amount_received?: number;
  paid_amount?: number;
  change?: number;
  due_amount?: number;
  payment_status?: string;
  payment_method: string;
  status: string;
  item_count: number;
};

type PurchaseOrder = {
  id: string;
  created_at: string;
  product_id?: string | null;
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

type DatePeriod = "All Time" | "Today" | "This Week" | "This Month";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const shortId = (id: string) =>
  "#" + id.replace(/-/g, "").slice(0, 8).toUpperCase();

const getOrderTotal = (o: SaleOrder): number => {
  if (
    o.grand_total !== undefined &&
    o.grand_total !== null &&
    (Number(o.grand_total) > 0 || Number(o.subtotal) > 0)
  ) {
    return Number(o.grand_total);
  }
  return Number(o.total_amount) || 0;
};

const getOrderDiscount = (o: SaleOrder): number =>
  Number(o.discount_amount ?? o.discount ?? 0) || 0;

const PaymentIcon = ({ method }: { method: string }) => {
  const m = method?.toLowerCase() ?? "";
  if (m.includes("cash"))
    return <Banknote className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
  if (m.includes("card"))
    return <CreditCard className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
  return <Smartphone className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
};

const SaleBadge = ({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus?: string;
}) => {
  const s = status?.toLowerCase() ?? "completed";
  if (s === "refunded") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white">
        <RotateCcw className="w-3 h-3" /> Refunded
      </span>
    );
  }
  if (paymentStatus === "Partial") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
        <Clock className="w-3 h-3" /> Partial Due
      </span>
    );
  }
  if (paymentStatus === "Unpaid") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
        <Clock className="w-3 h-3" /> Unpaid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800">
      <CheckCircle2 className="w-3 h-3" /> Paid
    </span>
  );
};

const PurchaseBadge = ({ status }: { status: string }) => {
  const s = status?.toLowerCase() ?? "received";
  const styles: Record<string, string> = {
    received: "bg-emerald-50 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    cancelled: "bg-gray-900 text-white",
  };
  const icons: Record<string, React.ReactNode> = {
    received: <CheckCircle2 className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
    cancelled: <XCircle className="w-3 h-3" />,
  };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
        styles[s] ?? styles.received
      }`}
    >
      {icons[s] ?? icons.received} {label}
    </span>
  );
};

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role } = useAuth();

  const [activeTab, setActiveTab] = useState<"sales" | "returns" | "purchase">(
    "sales"
  );
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All Payments");
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("All Time");
  const [sortOrder, setSortOrder] = useState<
    "newest" | "oldest" | "highest" | "lowest"
  >("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [salesOrders, setSalesOrders] = useState<SaleOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrderData | null>(
    null
  );
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);

  // Collect Due Modal State
  const [selectedOrderForDue, setSelectedOrderForDue] =
    useState<CollectDueOrder | null>(null);
  const [collectMode, setCollectMode] = useState<"partial" | "full">("partial");
  const [isCollectDueOpen, setIsCollectDueOpen] = useState(false);

  const handleOpenCollectDue = (
    order: SaleOrder,
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
    setIsCollectDueOpen(true);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ordersData } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map((o) => o.id);
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, quantity")
          .in("order_id", orderIds);

        const countMap: Record<string, number> = {};
        for (const item of itemsData || []) {
          countMap[item.order_id] =
            (countMap[item.order_id] ?? 0) + (Number(item.quantity) || 0);
        }

        // Exclude legacy ৳0 customer-seed rows that have 0 items
        const enriched = (ordersData as SaleOrder[])
          .map((o) => ({
            ...o,
            status: o.status ?? "Completed",
            item_count: countMap[o.id] ?? 0,
          }))
          .filter(
            (o) =>
              o.item_count > 0 ||
              getOrderTotal(o) > 0 ||
              Number(o.subtotal || 0) > 0
          );

        setSalesOrders(enriched);
      } else {
        setSalesOrders([]);
      }

      const { data: returnsData } = await supabase
        .from("sales_returns")
        .select("*")
        .order("created_at", { ascending: false });

      if (returnsData) {
        setSalesReturns(returnsData as SalesReturn[]);
      }

      const { data: purchasesData } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (purchasesData) {
        // Ignore orphan purchase rows from deleted products (product_id === null) or 0-qty rows
        const validPurchases = (purchasesData as PurchaseOrder[]).filter(
          (po) => po.product_id !== null && (Number(po.quantity) || 0) > 0
        );
        setPurchaseOrders(validPurchases);
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

  const matchesDatePeriod = useCallback(
    (iso: string) => {
      if (datePeriod === "All Time") return true;
      const d = new Date(iso);
      const now = new Date();
      if (datePeriod === "Today") {
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      }
      if (datePeriod === "This Week") {
        const start = new Date();
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        return d >= start;
      }
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    },
    [datePeriod]
  );

  const handleOpenReceipt = async (order: SaleOrder) => {
    setLoadingReceiptId(order.id);
    try {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("quantity, price, line_total, variant_label, products ( name )")
        .eq("order_id", order.id);

      const mappedItems = (orderItems || []).map(
        (oi: Record<string, unknown>) => {
          const prod = oi.products as { name?: string } | null;
          const qty = Number(oi.quantity) || 1;
          const unitPrice = Number(oi.price) || 0;
          const lineTotal =
            oi.line_total !== undefined &&
            oi.line_total !== null &&
            Number(oi.line_total) > 0
              ? Number(oi.line_total)
              : calculateLineTotal(unitPrice, qty);
          return {
            name: prod?.name || "Product",
            variant_label: oi.variant_label ? String(oi.variant_label) : null,
            quantity: qty,
            unit_price: unitPrice,
            line_total: lineTotal,
          };
        }
      );

      const computedSubtotal = roundMoney(
        mappedItems.reduce((s, it) => s + (it.line_total || 0), 0)
      );
      const subtotal =
        Number(order.subtotal) > 0 ? Number(order.subtotal) : computedSubtotal;
      const discountAmount = getOrderDiscount(order);
      const grandTotal = getOrderTotal(order);
      const paidAmount =
        order.paid_amount !== undefined && order.paid_amount !== null
          ? Number(order.paid_amount)
          : grandTotal;
      const amountReceived =
        order.amount_received !== undefined &&
        order.amount_received !== null &&
        Number(order.amount_received) > 0
          ? Number(order.amount_received)
          : paidAmount;
      const change = Number(order.change) || 0;
      const dueAmount = Number(order.due_amount) || 0;
      const paymentStatus: PaymentStatus =
        order.payment_status === "Partial" || order.payment_status === "Unpaid"
          ? order.payment_status
          : "Paid";
      const discountType: DiscountType =
        order.discount_type === "percentage" ? "percentage" : "fixed";

      setReceiptOrder({
        id: order.id,
        created_at: order.created_at,
        customer_name: order.customer_name || "Walk-in Customer",
        customer_mobile: order.customer_mobile || "",
        payment_method: order.payment_method || "Cash",
        subtotal,
        discount_type: discountType,
        discount_value: Number(order.discount_value) || discountAmount,
        discount_amount: discountAmount,
        grand_total: grandTotal,
        amount_received: amountReceived,
        paid_amount: paidAmount,
        change,
        due_amount: dueAmount,
        payment_status: paymentStatus,
        items: mappedItems,
      });
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const completedSales = useMemo(
    () =>
      salesOrders.filter(
        (o) =>
          (o.status ?? "Completed").toLowerCase() !== "refunded" &&
          matchesDatePeriod(o.created_at)
      ),
    [salesOrders, matchesDatePeriod]
  );

  const refundedOrders = useMemo(
    () =>
      salesOrders.filter(
        (o) =>
          (o.status ?? "").toLowerCase() === "refunded" &&
          matchesDatePeriod(o.created_at)
      ),
    [salesOrders, matchesDatePeriod]
  );

  const allReturns: SalesReturn[] = useMemo(() => {
    const base =
      salesReturns.length > 0
        ? salesReturns.filter((r) => matchesDatePeriod(r.created_at))
        : refundedOrders.map((o) => ({
            id: o.id,
            created_at: o.created_at,
            customer_name: o.customer_name,
            customer_mobile: o.customer_mobile,
            refund_amount: getOrderTotal(o),
            refund_method: o.payment_method,
            reason: "",
            item_count: o.item_count,
            restocked: false,
          }));
    return base;
  }, [salesReturns, refundedOrders, matchesDatePeriod]);

  const dateFilteredPurchases = useMemo(
    () => purchaseOrders.filter((p) => matchesDatePeriod(p.created_at)),
    [purchaseOrders, matchesDatePeriod]
  );

  const totalSalesAmount = useMemo(
    () =>
      roundMoney(
        completedSales.reduce((a, o) => a + getOrderTotal(o), 0)
      ),
    [completedSales]
  );

  const totalPurchasesAmount = useMemo(
    () =>
      roundMoney(
        dateFilteredPurchases.reduce((a, o) => a + (Number(o.total_cost) || 0), 0)
      ),
    [dateFilteredPurchases]
  );

  const totalRefundsAmount = useMemo(
    () =>
      roundMoney(
        allReturns.reduce((a, o) => a + (Number(o.refund_amount) || 0), 0)
      ),
    [allReturns]
  );

  const filteredSales = useMemo(
    () =>
      completedSales
        .filter((o) => {
          const q = search.toLowerCase().trim();
          const matchSearch =
            !q ||
            o.customer_name?.toLowerCase().includes(q) ||
            o.customer_mobile?.toLowerCase().includes(q) ||
            shortId(o.id).toLowerCase().includes(q);
          const matchPayment =
            paymentFilter === "All Payments" ||
            o.payment_method
              ?.toLowerCase()
              .includes(paymentFilter.toLowerCase());
          return matchSearch && matchPayment;
        })
        .sort((a, b) => {
          if (sortOrder === "newest")
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          if (sortOrder === "oldest")
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          if (sortOrder === "highest") return getOrderTotal(b) - getOrderTotal(a);
          return getOrderTotal(a) - getOrderTotal(b);
        }),
    [completedSales, search, paymentFilter, sortOrder]
  );

  const filteredReturns = useMemo(
    () =>
      allReturns
        .filter((o) => {
          const q = search.toLowerCase().trim();
          return (
            !q ||
            o.customer_name?.toLowerCase().includes(q) ||
            shortId(o.id).toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          if (sortOrder === "newest")
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          if (sortOrder === "oldest")
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          if (sortOrder === "highest")
            return b.refund_amount - a.refund_amount;
          return a.refund_amount - b.refund_amount;
        }),
    [allReturns, search, sortOrder]
  );

  const filteredPurchases = useMemo(
    () =>
      dateFilteredPurchases
        .filter((o) => {
          const q = search.toLowerCase().trim();
          return (
            !q ||
            o.supplier_name?.toLowerCase().includes(q) ||
            o.product_name?.toLowerCase().includes(q) ||
            shortId(o.id).toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          if (sortOrder === "newest")
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          if (sortOrder === "oldest")
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          if (sortOrder === "highest") return b.total_cost - a.total_cost;
          return a.total_cost - b.total_cost;
        }),
    [dateFilteredPurchases, search, sortOrder]
  );

  const activeData =
    activeTab === "sales"
      ? filteredSales
      : activeTab === "returns"
      ? filteredReturns
      : filteredPurchases;
  const totalPages = Math.max(1, Math.ceil(activeData.length / ITEMS_PER_PAGE));
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const paginatedReturns = filteredReturns.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const paginatedPurchases = filteredPurchases.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleTabChange = (tab: "sales" | "returns" | "purchase") => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearch("");
    setPaymentFilter("All Payments");
  };

  const handleExportCSV = () => {
    let rows: string[][] = [];
    if (activeTab === "sales") {
      rows = [
        [
          "Order ID",
          "Date",
          "Customer",
          "Phone",
          "Items",
          "Discount (BDT)",
          "Grand Total (BDT)",
          "Due (BDT)",
          "Payment Method",
          "Payment Status",
        ],
        ...filteredSales.map((o) => [
          shortId(o.id),
          new Date(o.created_at).toISOString(),
          `"${(o.customer_name || "Walk-in").replace(/"/g, '""')}"`,
          o.customer_mobile || "",
          String(o.item_count),
          getOrderDiscount(o).toFixed(2),
          getOrderTotal(o).toFixed(2),
          (Number(o.due_amount) || 0).toFixed(2),
          o.payment_method || "",
          o.payment_status || "Paid",
        ]),
      ];
    } else if (activeTab === "returns") {
      rows = [
        ["Return ID", "Date", "Customer", "Items", "Refund Amount (BDT)", "Method"],
        ...filteredReturns.map((r) => [
          shortId(r.id),
          new Date(r.created_at).toISOString(),
          `"${(r.customer_name || "Walk-in").replace(/"/g, '""')}"`,
          String(r.item_count),
          (Number(r.refund_amount) || 0).toFixed(2),
          r.refund_method || "",
        ]),
      ];
    } else {
      rows = [
        ["PO ID", "Date", "Supplier", "Product", "Quantity", "Total Cost (BDT)", "Status"],
        ...filteredPurchases.map((p) => [
          shortId(p.id),
          new Date(p.created_at).toISOString(),
          `"${(p.supplier_name || "").replace(/"/g, '""')}"`,
          `"${(p.product_name || "").replace(/"/g, '""')}"`,
          String(p.quantity),
          (Number(p.total_cost) || 0).toFixed(2),
          p.status || "",
        ]),
      ];
    }

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rizq-${activeTab}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Order History
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
            Sales receipts, returns, and stock purchases
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            className="min-h-[44px] flex items-center gap-2 bg-white border border-gray-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 text-gray-400 ${
                loading ? "animate-spin" : ""
              }`}
            />
            <span>Refresh</span>
          </button>

          <div className="relative">
            <select
              value={datePeriod}
              onChange={(e) => {
                setDatePeriod(e.target.value as DatePeriod);
                setCurrentPage(1);
              }}
              className="min-h-[44px] appearance-none bg-white border border-gray-200 pl-3.5 pr-9 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer"
            >
              <option value="All Time">All Time</option>
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={activeData.length === 0}
            className="min-h-[44px] flex items-center gap-2 bg-black px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {role !== "salesman" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <button
            type="button"
            onClick={() => handleTabChange("sales")}
            className={`text-left p-4 sm:p-5 rounded-2xl border transition-all ${
              activeTab === "sales"
                ? "bg-gray-900 border-gray-900 text-white shadow-md"
                : "bg-white border-gray-200/80 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Total Sales Revenue
              </span>
              <ShoppingCart className="w-4 h-4 text-gray-400" />
            </div>
            <div
              className={`text-2xl sm:text-3xl font-black ${
                activeTab === "sales" ? "text-white" : "text-gray-900"
              }`}
            >
              {loading ? "—" : `৳${formatBDT(totalSalesAmount)}`}
            </div>
            <div className="text-xs font-medium text-gray-400 mt-1">
              {completedSales.length} completed orders
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("returns")}
            className={`text-left p-4 sm:p-5 rounded-2xl border transition-all ${
              activeTab === "returns"
                ? "bg-gray-900 border-gray-900 text-white shadow-md"
                : "bg-white border-gray-200/80 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Total Refunds
              </span>
              <RotateCcw className="w-4 h-4 text-gray-400" />
            </div>
            <div
              className={`text-2xl sm:text-3xl font-black ${
                activeTab === "returns" ? "text-white" : "text-gray-900"
              }`}
            >
              {loading ? "—" : `৳${formatBDT(totalRefundsAmount)}`}
            </div>
            <div className="text-xs font-medium text-gray-400 mt-1">
              {allReturns.length} refunded orders
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("purchase")}
            className={`text-left p-4 sm:p-5 rounded-2xl border transition-all ${
              activeTab === "purchase"
                ? "bg-gray-900 border-gray-900 text-white shadow-md"
                : "bg-white border-gray-200/80 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Total Purchase Cost
              </span>
              <Package className="w-4 h-4 text-gray-400" />
            </div>
            <div
              className={`text-2xl sm:text-3xl font-black ${
                activeTab === "purchase" ? "text-white" : "text-gray-900"
              }`}
            >
              {loading ? "—" : `৳${formatBDT(totalPurchasesAmount)}`}
            </div>
            <div className="text-xs font-medium text-gray-400 mt-1">
              {dateFilteredPurchases.length} purchase batches
            </div>
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-5 border-b border-gray-100 px-4 sm:px-6 pt-4 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => handleTabChange("sales")}
            className={`min-h-[44px] pb-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "sales"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Sales ({completedSales.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("returns")}
            className={`min-h-[44px] pb-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === "returns"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Returns ({allReturns.length})
          </button>
          {role !== "salesman" && (
            <button
              type="button"
              onClick={() => handleTabChange("purchase")}
              className={`min-h-[44px] pb-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === "purchase"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              Purchases ({dateFilteredPurchases.length})
            </button>
          )}
        </div>

        {/* Filters */}
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
              placeholder={
                activeTab === "purchase"
                  ? "Search supplier or product..."
                  : "Search customer, phone, or order ID..."
              }
              className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "sales" && (
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={paymentFilter}
                  onChange={(e) => {
                    setPaymentFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full min-h-[44px] appearance-none pl-3.5 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer"
                >
                  <option>All Payments</option>
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Mobile</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}

            <div className="relative flex-1 sm:flex-initial">
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as typeof sortOrder)
                }
                className="w-full min-h-[44px] appearance-none pl-3.5 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="highest">Highest Amount</option>
                <option value="lowest">Lowest Amount</option>
              </select>
              <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Content: Mobile Cards (md:hidden) + Desktop Table (hidden md:block) */}
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
            Loading history...
          </div>
        ) : activeTab === "sales" ? (
          paginatedSales.length === 0 ? (
            <div className="py-16 px-4 text-center text-sm text-gray-400">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No sales orders yet.
            </div>
          ) : (
            <>
              {/* Mobile Card List */}
              <div className="md:hidden divide-y divide-gray-100">
                {paginatedSales.map((order) => {
                  const total = getOrderTotal(order);
                  const disc = getOrderDiscount(order);
                  const due = Number(order.due_amount) || 0;
                  return (
                    <div key={order.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-extrabold text-gray-900 font-mono">
                            {shortId(order.id)}
                          </span>
                          <p className="text-sm font-bold text-gray-900 mt-0.5">
                            {order.customer_name || "Walk-in"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(order.created_at)} •{" "}
                            {formatTime(order.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-gray-900">
                            ৳{formatBDT(total)}
                          </p>
                          {disc > 0 && (
                            <p className="text-[11px] font-semibold text-emerald-700">
                              Disc: -৳{formatBDT(disc)}
                            </p>
                          )}
                          {due > 0 && (
                            <p className="text-[11px] font-bold text-amber-700">
                              Due: ৳{formatBDT(due)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SaleBadge
                            status={order.status}
                            paymentStatus={order.payment_status}
                          />
                          <span className="text-xs text-gray-500 font-medium">
                            {order.item_count}{" "}
                            {order.item_count === 1 ? "item" : "items"} •{" "}
                            {order.payment_method}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {due > 0 && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenCollectDue(order, "partial")}
                                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-xs font-bold text-white flex items-center gap-1 shadow-2xs transition-colors"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pay Partial</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCollectDue(order, "full")}
                                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white flex items-center gap-1 shadow-2xs transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Settle Full</span>
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenReceipt(order)}
                            disabled={loadingReceiptId === order.id}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#f3f0ea] hover:bg-gray-200 text-xs font-bold text-gray-900 flex items-center gap-1.5"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>
                              {loadingReceiptId === order.id
                                ? "Loading..."
                                : "Receipt"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {[
                        "ORDER ID",
                        "DATE & TIME",
                        "CUSTOMER",
                        "ITEMS",
                        "DISCOUNT",
                        "GRAND TOTAL (৳)",
                        "PAYMENT",
                        "STATUS",
                        "RECEIPT",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSales.map((order) => {
                      const total = getOrderTotal(order);
                      const disc = getOrderDiscount(order);
                      const due = Number(order.due_amount) || 0;
                      return (
                        <tr
                          key={order.id}
                          className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                        >
                          <td className="px-4 py-3.5 text-xs font-bold text-gray-800 font-mono whitespace-nowrap">
                            {shortId(order.id)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="text-xs font-semibold text-gray-800">
                              {formatDate(order.created_at)}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {formatTime(order.created_at)}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-xs font-semibold text-gray-900">
                              {order.customer_name || "Walk-in"}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {order.customer_mobile || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-gray-600">
                            {order.item_count}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                            {disc > 0 ? `-৳${formatBDT(disc)}` : "—"}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="text-xs font-extrabold text-gray-900">
                              ৳{formatBDT(total)}
                            </div>
                            {due > 0 && (
                              <div className="text-[10px] font-bold text-amber-700">
                                Due: ৳{formatBDT(due)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                              <PaymentIcon method={order.payment_method} />
                              <span>{order.payment_method}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <SaleBadge
                              status={order.status}
                              paymentStatus={order.payment_status}
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {due > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollectDue(order, "partial")}
                                    className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-xs font-bold text-white flex items-center gap-1 shadow-2xs transition-colors whitespace-nowrap"
                                    title="Pay Partial Due"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Pay Partial</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollectDue(order, "full")}
                                    className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white flex items-center gap-1 shadow-2xs transition-colors whitespace-nowrap"
                                    title="Settle Full Due"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Settle Full</span>
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenReceipt(order)}
                                disabled={loadingReceiptId === order.id}
                                className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#f3f0ea] hover:bg-gray-200 text-xs font-bold text-gray-900 flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Receipt</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : activeTab === "returns" ? (
          paginatedReturns.length === 0 ? (
            <div className="py-16 px-4 text-center text-sm text-gray-400">
              <RotateCcw className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No sales returns recorded yet.
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-gray-100">
                {paginatedReturns.map((ret) => (
                  <div key={ret.id} className="p-4 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-xs font-bold font-mono text-gray-700">
                          {shortId(ret.id)}
                        </span>
                        <p className="text-sm font-bold text-gray-900">
                          {ret.customer_name || "Walk-in"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(ret.created_at)} •{" "}
                          {formatTime(ret.created_at)}
                        </p>
                      </div>
                      <p className="text-base font-black text-gray-900">
                        ৳{formatBDT(ret.refund_amount)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {ret.item_count} items • via {ret.refund_method}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-900 text-white text-[10px] font-bold">
                        Refunded
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {[
                        "RETURN ID",
                        "DATE & TIME",
                        "CUSTOMER",
                        "ITEMS",
                        "REFUND (৳)",
                        "METHOD",
                        "STATUS",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReturns.map((ret) => (
                      <tr
                        key={ret.id}
                        className="border-b border-gray-50 hover:bg-gray-50/60"
                      >
                        <td className="px-4 py-3.5 text-xs font-bold font-mono text-gray-700">
                          {shortId(ret.id)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs font-semibold text-gray-800">
                            {formatDate(ret.created_at)}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {formatTime(ret.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs font-semibold text-gray-900">
                            {ret.customer_name || "Walk-in"}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {ret.customer_mobile || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-gray-600">
                          {ret.item_count}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-bold text-gray-900">
                          ৳{formatBDT(ret.refund_amount)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                            <PaymentIcon method={ret.refund_method} />
                            <span>{ret.refund_method}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white">
                            <RotateCcw className="w-3 h-3" /> Refunded
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : paginatedPurchases.length === 0 ? (
          <div className="py-16 px-4 text-center text-sm text-gray-400">
            <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No purchase records yet.
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-gray-100">
              {paginatedPurchases.map((po) => (
                <div key={po.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {po.product_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Supplier: {po.supplier_name || "—"} • Qty: {po.quantity}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {formatDate(po.created_at)}
                      </p>
                    </div>
                    <p className="text-base font-black text-gray-900 shrink-0">
                      ৳{formatBDT(po.total_cost)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {po.payment_method}
                    </span>
                    <PurchaseBadge status={po.status} />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      "PO ID",
                      "DATE",
                      "SUPPLIER",
                      "PRODUCT",
                      "QTY",
                      "TOTAL COST (৳)",
                      "PAYMENT",
                      "STATUS",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedPurchases.map((po) => (
                    <tr
                      key={po.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3.5 text-xs font-bold font-mono text-gray-700">
                        {shortId(po.id)}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 whitespace-nowrap">
                        {formatDate(po.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-800">
                        {po.supplier_name || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-700 max-w-[180px] truncate">
                        {po.product_name}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-gray-600">
                        {po.quantity}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-bold text-gray-900 whitespace-nowrap">
                        ৳{formatBDT(po.total_cost)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                          <PaymentIcon method={po.payment_method} />
                          <span>{po.payment_method}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <PurchaseBadge status={po.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        {!loading && activeData.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-semibold">
              Showing{" "}
              {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, activeData.length)}
              –{Math.min(currentPage * ITEMS_PER_PAGE, activeData.length)} of{" "}
              {activeData.length}
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

      {/* Receipt Viewer / Thermal Reprint Modal */}
      <ReceiptModal
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
        title="Order Receipt"
        primaryActionLabel="Done"
      />

      {/* Collect Due Modal */}
      <CollectDueModal
        isOpen={isCollectDueOpen}
        onClose={() => {
          setIsCollectDueOpen(false);
          setSelectedOrderForDue(null);
        }}
        order={selectedOrderForDue}
        initialMode={collectMode}
        onSuccess={(updatedOrder) => {
          fetchData();
          setReceiptOrder(updatedOrder);
        }}
      />
    </div>
  );
}

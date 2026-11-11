"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
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
  Coins,
  Receipt,
  Printer,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { formatBDT, roundMoney } from "@/lib/calculations";
import CollectDueModal, { CollectDueOrder } from "@/components/CollectDueModal";
import ReceiptModal, { ReceiptOrderData } from "@/components/ReceiptModal";

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

const shortId = (id: string) =>
  "#ORD-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

const PaymentIcon = ({ method }: { method: string }) => {
  const m = (method ?? "").toLowerCase();
  if (m.includes("cash")) return <Banknote className="w-4 h-4 text-gray-400" />;
  if (m.includes("card"))
    return <CreditCard className="w-4 h-4 text-gray-400" />;
  return <Smartphone className="w-4 h-4 text-gray-400" />;
};

type Order = {
  id: string;
  created_at: string;
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
  item_count: number;
  customer_mobile?: string;
};

const getOrderTotal = (o: Order) =>
  o.grand_total !== undefined &&
  o.grand_total !== null &&
  (Number(o.grand_total) > 0 || Number(o.subtotal) > 0)
    ? Number(o.grand_total)
    : Number(o.total_amount) || 0;

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = useMemo(() => createClient(), []);

  const customerName = decodeURIComponent(params.name as string);

  const [orders, setOrders] = useState<Order[]>([]);
  const [savedPhone, setSavedPhone] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<
    "newest" | "oldest" | "highest" | "lowest"
  >("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Dues & Receipt Modals
  const [selectedOrderForDue, setSelectedOrderForDue] =
    useState<CollectDueOrder | null>(null);
  const [collectMode, setCollectMode] = useState<"partial" | "full">("partial");
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<ReceiptOrderData | null>(
    null
  );

  const handleOpenCollectDue = (
    order: Order,
    mode: "partial" | "full" = "partial"
  ) => {
    setSelectedOrderForDue({
      id: order.id,
      created_at: order.created_at,
      customer_name: customerName,
      customer_mobile: mobile !== "—" ? mobile : "",
      grand_total: getOrderTotal(order),
      paid_amount: Number(order.paid_amount) || 0,
      due_amount: Number(order.due_amount) || 0,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
    });
    setCollectMode(mode);
    setIsCollectModalOpen(true);
  };

  const handleOpenReceipt = async (order: Order) => {
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
      customer_name: customerName,
      customer_mobile: mobile !== "—" ? mobile : "",
      payment_method: order.payment_method || "Cash",
      subtotal: Number(order.subtotal) || 0,
      discount_type: (order as any).discount_type || "fixed",
      discount_value: Number((order as any).discount_value) || 0,
      discount_amount: Number((order as any).discount_amount) || 0,
      grand_total: getOrderTotal(order),
      amount_received: Number(order.amount_received) || 0,
      paid_amount: Number(order.paid_amount || order.amount_received) || 0,
      change: Number(order.change) || 0,
      due_amount: Number(order.due_amount) || 0,
      payment_status: (order.payment_status as any) || "Paid",
      items: formattedItems,
    });
  };

  const fetchCustomerDetails = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, ordersRes] = await Promise.all([
        supabase
          .from("customers")
          .select("mobile")
          .ilike("name", customerName)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("*")
          .eq("customer_name", customerName)
          .order("created_at", { ascending: false }),
      ]);

      if (custRes.data?.mobile) {
        setSavedPhone(custRes.data.mobile);
      }

      const ordersData = (ordersRes.data || []) as Order[];
      if (ordersData.length > 0) {
        const orderIds = ordersData.map((o) => o.id);
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, quantity")
          .in("order_id", orderIds);

        const countMap: Record<string, number> = {};
        for (const item of itemsData ?? []) {
          countMap[item.order_id] =
            (countMap[item.order_id] ?? 0) + (Number(item.quantity) || 0);
        }

        const realOrders = ordersData
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

        setOrders(realOrders);
      } else {
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, customerName]);

  useEffect(() => {
    fetchCustomerDetails();
  }, [fetchCustomerDetails]);

  const totalOrders = orders.length;
  const lifetimeSpend = roundMoney(
    orders.reduce((s, o) => s + getOrderTotal(o), 0)
  );
  const totalDue = roundMoney(
    orders
      .filter((o) => o.status !== "Refunded" && o.status !== "Cancelled")
      .reduce((s, o) => s + (Number(o.due_amount) || 0), 0)
  );
  const avgOrderValue =
    totalOrders > 0 ? roundMoney(lifetimeSpend / totalOrders) : 0;
  const lastPurchase = orders[0]?.created_at ?? null;
  const mobile = savedPhone || orders[0]?.customer_mobile || "—";

  const favPayment = useMemo(() => {
    const paymentCount: Record<string, number> = {};
    for (const o of orders) {
      const m = o.payment_method ?? "Cash";
      paymentCount[m] = (paymentCount[m] ?? 0) + 1;
    }
    return (
      Object.entries(paymentCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"
    );
  }, [orders]);

  const sorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        if (sortOrder === "newest")
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        if (sortOrder === "oldest")
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        if (sortOrder === "highest") return getOrderTotal(b) - getOrderTotal(a);
        return getOrderTotal(a) - getOrderTotal(b);
      }),
    [orders, sortOrder]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = sorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const avatarColor = getAvatarColor(customerName);
  const initials = getInitials(customerName);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/customers")}
          className="hover:text-gray-900"
        >
          Customers
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-900 font-bold truncate">{customerName}</span>
      </div>

      {/* Profile + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 p-6 flex flex-col items-center text-center">
          <div
            className={`w-18 h-18 rounded-full flex items-center justify-center text-2xl font-black mb-3 ${avatarColor}`}
          >
            {initials}
          </div>
          <h1 className="text-lg font-black text-gray-900 mb-2">
            {customerName}
          </h1>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Phone className="w-3.5 h-3.5 text-gray-400" />
            <span>{mobile !== "—" ? mobile : "No phone saved"}</span>
          </div>
        </div>

        <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Total Orders
              </span>
              <ShoppingBag className="w-4 h-4 text-gray-600" />
            </div>
            <div className="text-3xl font-black text-gray-900">
              {loading ? "—" : totalOrders}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Lifetime Spend
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-gray-900">
              {loading ? "—" : `৳${formatBDT(lifetimeSpend)}`}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Outstanding Due
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div
                className={`text-2xl sm:text-3xl font-black ${
                  totalDue > 0 ? "text-amber-700" : "text-gray-900"
                }`}
              >
                {loading ? "—" : `৳${formatBDT(totalDue)}`}
              </div>
              {totalDue > 0 && !loading && (
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const dueOrder = orders.find(
                        (o) => (Number(o.due_amount) || 0) > 0
                      );
                      if (dueOrder) handleOpenCollectDue(dueOrder, "partial");
                    }}
                    className="min-h-[36px] flex-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pay Partial</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const dueOrder = orders.find(
                        (o) => (Number(o.due_amount) || 0) > 0
                      );
                      if (dueOrder) handleOpenCollectDue(dueOrder, "full");
                    }}
                    className="min-h-[36px] flex-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Settle Full</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Avg Order Value
            </p>
            <p className="text-xl font-black text-gray-900">
              {loading ? "—" : `৳${formatBDT(avgOrderValue)}`}
            </p>
          </div>
          <TrendingUp className="w-5 h-5 text-gray-400" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Last Purchase
            </p>
            <p className="text-lg font-black text-gray-900">
              {loading ? "—" : formatDate(lastPurchase)}
            </p>
          </div>
          <Calendar className="w-5 h-5 text-gray-400" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Preferred Payment
            </p>
            <p className="text-lg font-black text-gray-900">
              {loading ? "—" : favPayment}
            </p>
          </div>
          <Star className="w-5 h-5 text-amber-400" />
        </div>
      </div>

      {/* Purchase History */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            Purchase History
          </h2>
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as typeof sortOrder);
                setCurrentPage(1);
              }}
              className="min-h-[40px] appearance-none pl-3 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="newest">Date (Newest)</option>
              <option value="oldest">Date (Oldest)</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">
            Loading orders...
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-14 px-4 text-center text-sm text-gray-400">
            No orders recorded for this customer yet.
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-gray-100">
              {paginated.map((order) => {
                const total = getOrderTotal(order);
                const due = Number(order.due_amount) || 0;
                return (
                  <div key={order.id} className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold font-mono text-gray-800">
                          {shortId(order.id)}
                        </span>
                        <p className="text-xs text-gray-500">
                          {formatDate(order.created_at)} • {order.item_count}{" "}
                          items
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-gray-900">
                          ৳{formatBDT(total)}
                        </p>
                        {due > 0 && (
                          <p className="text-[11px] font-bold text-amber-700">
                            Due: ৳{formatBDT(due)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-50">
                      <button
                        type="button"
                        onClick={() => handleOpenReceipt(order)}
                        className="min-h-[36px] px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Receipt</span>
                      </button>
                      {due > 0 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenCollectDue(order, "partial")}
                            className="min-h-[36px] px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pay Partial</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCollectDue(order, "full")}
                            className="min-h-[36px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Settle Full</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    {[
                      "Order ID",
                      "Date",
                      "Items",
                      "Grand Total",
                      "Due",
                      "Payment",
                      "Status",
                      "Action",
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-6 py-3.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                          h === "Grand Total" || h === "Items" || h === "Due"
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
                  {paginated.map((order) => {
                    const total = getOrderTotal(order);
                    const due = Number(order.due_amount) || 0;
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-gray-50 hover:bg-gray-50/60"
                      >
                        <td className="px-6 py-4 text-xs font-bold font-mono text-gray-900">
                          {shortId(order.id)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">
                          {order.item_count}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-gray-900 text-right whitespace-nowrap">
                          ৳{formatBDT(total)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-right whitespace-nowrap">
                          {due > 0 ? (
                            <span className="text-amber-700">
                              ৳{formatBDT(due)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                            <PaymentIcon method={order.payment_method} />
                            <span>{order.payment_method}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {order.status === "Refunded" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white">
                              <RotateCcw className="w-3 h-3" /> Refunded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />{" "}
                              {order.payment_status || "Paid"}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {due > 0 ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCollectDue(order, "partial")}
                                  className="min-h-[34px] px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all"
                                  title="Pay Partial Due"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Pay Partial</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCollectDue(order, "full")}
                                  className="min-h-[34px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all"
                                  title="Settle Full Due"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Settle Full</span>
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleOpenReceipt(order)}
                              className="min-h-[34px] px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                              title="View & Print Receipt"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline">Receipt</span>
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
        )}

        {!loading && sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-semibold">
              Showing{" "}
              {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, sorted.length)}–
              {Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)} of{" "}
              {sorted.length}
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

      {/* Collect Due Modal */}
      <CollectDueModal
        isOpen={isCollectModalOpen}
        onClose={() => {
          setIsCollectModalOpen(false);
          setSelectedOrderForDue(null);
        }}
        order={selectedOrderForDue}
        initialMode={collectMode}
        onSuccess={(updatedOrder) => {
          fetchCustomerDetails();
          // Prompt receipt
          setReceiptOrder(updatedOrder);
        }}
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

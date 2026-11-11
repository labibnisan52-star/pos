"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  ChevronRight,
  AlertCircle,
  Calendar,
  ChevronDown,
  ClipboardList,
  Contact,
  Banknote,
  Plus,
  Receipt,
  Undo2,
  Store,
} from "lucide-react";
import AddExpenseModal from "@/components/AddExpenseModal";
import {
  calculateCartTotals,
  formatBDT,
  roundMoney,
} from "@/lib/calculations";

type TopProduct = { name: string; quantity: number; revenue: number };

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);

  const [timeFilter, setTimeFilter] = useState<
    "Today" | "This Month" | "Custom Range"
  >("Today");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [sales, setSales] = useState(0);
  const [grossSales, setGrossSales] = useState(0);
  const [returnsValue, setReturnsValue] = useState(0);
  const [cogs, setCogs] = useState(0);
  const [outstandingDues, setOutstandingDues] = useState(0);
  const [expenses, setExpenses] = useState<
    { description: string; amount: number }[]
  >([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
      } else {
        setLoading(false);
      }
    };
    checkUser();
  }, [router, supabase]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      let startIso = "";
      let endIso = "";
      let startStr = "";
      let endStr = "";

      if (timeFilter === "Custom Range") {
        if (!customStartDate || !customEndDate) {
          setLoadingData(false);
          return;
        }
        let s = new Date(customStartDate + "T00:00:00");
        let e = new Date(customEndDate + "T23:59:59");

        if (s > e) {
          s = new Date(customEndDate + "T00:00:00");
          e = new Date(customStartDate + "T23:59:59");
          startStr = customEndDate;
          endStr = customStartDate;
        } else {
          startStr = customStartDate;
          endStr = customEndDate;
        }

        startIso = s.toISOString();
        endIso = e.toISOString();
      } else {
        const now = new Date();
        const startDate = new Date();

        if (timeFilter === "Today") {
          startDate.setHours(0, 0, 0, 0);
        } else {
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
        }

        startIso = startDate.toISOString();
        endIso = now.toISOString();
        startStr = startDate.toLocaleDateString("en-CA");
        endStr = now.toLocaleDateString("en-CA");
      }

      // 1. Fetch Summary via RPC (uses saved grand_total so discounts reduce profit)
      const { data: summaryData, error: summaryError } = await supabase.rpc(
        "get_summary",
        {
          _date_from: startIso,
          _date_to: endIso,
        }
      );

      if (!summaryError && summaryData) {
        setGrossSales(Number(summaryData.gross_sales) || 0);
        setReturnsValue(Number(summaryData.returns_selling_value) || 0);
        setSales(Number(summaryData.net_sales) || 0);
        setCogs(Number(summaryData.cogs) || 0);
        setTotalExpenses(Number(summaryData.total_expenses) || 0);
        setNetProfit(Number(summaryData.net_profit) || 0);
        if (summaryData.outstanding_dues !== undefined) {
          setOutstandingDues(Number(summaryData.outstanding_dues) || 0);
        }
      }

      // 2. Fetch Outstanding Dues directly if column exists (ensures accuracy even before RPC refresh)
      const { data: dueOrders, error: dueErr } = await supabase
        .from("orders")
        .select("due_amount, status")
        .gt("due_amount", 0);

      if (!dueErr && dueOrders) {
        const totalDues = dueOrders
          .filter(
            (o) =>
              o.status !== "Refunded" && o.status !== "Cancelled"
          )
          .reduce((sum, o) => sum + (Number(o.due_amount) || 0), 0);
        setOutstandingDues(roundMoney(totalDues));
      }

      // 3. Fetch Orders & Items for Top Products (using net discounted revenue)
      const { data: salesData } = await supabase
        .from("orders")
        .select("id, subtotal, discount_amount, discount, grand_total, total_amount, status")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      const validOrders = (salesData || []).filter(
        (o) => o.status !== "Cancelled" && (Number(o.total_amount) > 0 || Number(o.subtotal) > 0)
      );

      if (validOrders.length > 0) {
        const orderMap = new Map(validOrders.map((o) => [String(o.id), o]));
        const orderIds = validOrders.map((o) => o.id);

        const { data: itemsData } = await supabase
          .from("order_items")
          .select("order_id, product_id, quantity, price, net_amount")
          .in("order_id", orderIds);

        if (itemsData && itemsData.length > 0) {
          // Group items by order so orders without saved net_amount still get exact discount allocation
          const itemsByOrder = new Map<
            string,
            Array<Record<string, unknown>>
          >();
          for (const item of itemsData) {
            const oid = String(item.order_id);
            const list = itemsByOrder.get(oid) || [];
            list.push(item as Record<string, unknown>);
            itemsByOrder.set(oid, list);
          }

          const productStats: Record<
            string,
            { quantity: number; revenue: number }
          > = {};
          const productIds = new Set<string>();

          for (const [oid, orderItemsList] of itemsByOrder.entries()) {
            const ord = orderMap.get(oid);
            const ordDisc =
              Number(ord?.discount_amount ?? ord?.discount ?? 0) || 0;
            const calc = calculateCartTotals({
              items: orderItemsList.map((it) => ({
                id: String(it.product_id || ""),
                unitPrice: Number(it.price) || 0,
                quantity: Number(it.quantity) || 0,
              })),
              discountType: "fixed",
              discountValue: ordDisc,
            });

            orderItemsList.forEach((it, idx) => {
              const pid = String(it.product_id || "");
              if (!pid) return;
              productIds.add(pid);
              if (!productStats[pid]) {
                productStats[pid] = { quantity: 0, revenue: 0 };
              }
              const qty = Number(it.quantity) || 0;
              const savedNet = Number(it.net_amount);
              const netRev =
                Number.isFinite(savedNet) && savedNet > 0
                  ? savedNet
                  : calc.items[idx]?.netAmount ?? 0;

              productStats[pid].quantity += qty;
              productStats[pid].revenue = roundMoney(
                productStats[pid].revenue + netRev
              );
            });
          }

          const { data: productsData } = await supabase
            .from("products")
            .select("id, name")
            .in("id", Array.from(productIds));

          const productNameMap: Record<string, string> = {};
          for (const p of productsData || []) {
            productNameMap[p.id] = p.name;
          }

          const topArr: TopProduct[] = Object.entries(productStats).map(
            ([pId, stats]) => ({
              name: productNameMap[pId] || "Product",
              quantity: stats.quantity,
              revenue: stats.revenue,
            })
          );

          topArr.sort((a, b) => b.revenue - a.revenue);
          setTopProducts(topArr.slice(0, 5));
        } else {
          setTopProducts([]);
        }
      } else {
        setTopProducts([]);
      }

      // 4. Fetch Expenses
      const { data: expData, error: expError } = await supabase
        .from("expenses")
        .select("description, amount")
        .gte("expense_date", startStr)
        .lte("expense_date", endStr);

      if (!expError) {
        setExpenses(expData || []);
      } else {
        setExpenses([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }, [supabase, timeFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (!loading) {
      if (timeFilter === "Custom Range" && (!customStartDate || !customEndDate))
        return;
      fetchData();
    }
  }, [loading, timeFilter, customStartDate, customEndDate, fetchData]);

  if (loading) {
    return (
      <div className="p-10 flex-1 h-full flex items-center justify-center text-sm text-gray-500">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar relative">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <p className="text-xs sm:text-sm font-semibold text-gray-500">
            {greeting}, Owner
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-0.5">
            Rizq Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-200 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-gray-700">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>
              {new Date().toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <Link
            href="/dashboard/pos"
            className="min-h-[44px] px-4 py-2.5 bg-black text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 hover:bg-gray-800 transition-colors"
          >
            <Store className="w-4 h-4" />
            <span>Open POS</span>
          </Link>
        </div>
      </div>

      {/* Summary Filter Header */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-4 gap-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Summary</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {timeFilter === "Custom Range" && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="flex-1 sm:flex-initial min-h-[44px] bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-gray-900 focus:outline-none focus:border-gray-900"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="flex-1 sm:flex-initial min-h-[44px] bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-gray-900 focus:outline-none focus:border-gray-900"
              />
            </div>
          )}
          <div className="relative w-full sm:w-auto">
            <select
              value={timeFilter}
              onChange={(e) => {
                const next = e.target.value as
                  | "Today"
                  | "This Month"
                  | "Custom Range";
                setTimeFilter(next);
                if (next !== "Custom Range") {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }
              }}
              className="w-full sm:w-auto min-h-[44px] appearance-none bg-white border border-gray-200 pl-4 pr-10 py-2.5 rounded-xl text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors focus:outline-none cursor-pointer"
            >
              <option value="Today">Today</option>
              <option value="This Month">This Month</option>
              <option value="Custom Range">Custom Range</option>
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 2x2 Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative">
        {loadingData && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
            <span className="text-sm font-semibold text-gray-500">
              Calculating...
            </span>
          </div>
        )}

        {/* Net Sales */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <span className="text-gray-600 text-sm font-semibold">
              Net Sales
            </span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center border border-orange-100">
              <ClipboardList className="w-4 h-4 text-orange-500" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            ৳{formatBDT(sales)}
          </div>
        </div>

        {/* Returns */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <span className="text-gray-600 text-sm font-semibold">Returns</span>
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center border border-red-100">
              <Undo2 className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            ৳{formatBDT(returnsValue)}
          </div>
        </div>

        {/* Outstanding Dues */}
        <Link
          href="/dashboard/dues"
          className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between hover:border-amber-300 hover:shadow-xs transition-all group"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-gray-600 text-sm font-semibold group-hover:text-amber-800 transition-colors">
              Outstanding Dues
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100 group-hover:bg-amber-100 transition-colors">
              <Contact className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700">
              ৳{formatBDT(outstandingDues)}
            </div>
            <span className="text-[11px] font-bold text-amber-800 group-hover:underline flex items-center gap-1 mt-1">
              <span>View &amp; Collect Dues</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </Link>

        {/* Net Profit */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <span className="text-gray-600 text-sm font-semibold">
              Net Profit
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <Banknote className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black ${
              netProfit >= 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            ৳{formatBDT(netProfit)}
          </div>
        </div>
      </div>

      {/* Product Sales List */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 mb-6">
        <div className="flex justify-between items-center mb-5 gap-2">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            Top Product Sales ({timeFilter})
          </h2>
          <Link
            href="/dashboard/analytics"
            className="min-h-[40px] px-2 text-xs sm:text-sm font-semibold text-gray-600 hover:text-gray-900 flex items-center shrink-0"
          >
            Analytics <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
        <div className="space-y-3.5">
          {loadingData ? (
            <div className="text-sm text-gray-400 py-4 text-center">
              Loading...
            </div>
          ) : topProducts.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">
              No product sales recorded for this period yet.
            </div>
          ) : (
            topProducts.map((p, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center gap-3 border-b border-gray-100 pb-3.5 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 truncate">
                    {p.name}
                  </h4>
                  <p className="text-xs text-gray-500 font-medium">
                    {p.quantity} {p.quantity === 1 ? "pair/unit" : "pairs/units"} sold
                  </p>
                </div>
                <div className="text-sm font-extrabold text-gray-900 shrink-0">
                  ৳{formatBDT(p.revenue)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Expenses & Profit Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
        {/* Expenses List */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 flex flex-col">
          <div className="flex justify-between items-center mb-5 gap-2">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              Expenses ({timeFilter})
            </h2>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Expense</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[180px]">
            {loadingData ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Loading...
              </div>
            ) : expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                  <Receipt className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">
                  No expenses recorded for {timeFilter.toLowerCase()}.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Tap &ldquo;Add Expense&rdquo; to record shop costs.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {expenses.map((exp, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center gap-3 border-b border-gray-100 pb-3 last:border-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="text-sm font-semibold text-gray-800 truncate">
                        {exp.description}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0">
                      ৳{formatBDT(exp.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Net Profit Breakdown */}
        <div className="bg-[#e9e6df] p-5 sm:p-6 rounded-2xl border border-gray-200 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                Net Profit Breakdown
              </h2>
              <span className="text-xs font-bold text-gray-700 bg-white/70 px-2.5 py-1 rounded-lg">
                {timeFilter}
              </span>
            </div>

            <div className="space-y-3.5">
              <div className="flex justify-between items-center text-sm text-gray-700">
                <span>Discounted Gross Sales</span>
                <span className="font-semibold">৳{formatBDT(grossSales)}</span>
              </div>

              {returnsValue > 0 && (
                <div className="flex justify-between items-center text-sm text-red-600">
                  <span>Returns (Refunds)</span>
                  <span className="font-semibold">
                    -৳{formatBDT(returnsValue)}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center font-medium text-sm text-gray-900 border-t border-gray-300/80 pt-2.5">
                <span>Total Net Sales</span>
                <span className="font-bold">৳{formatBDT(sales)}</span>
              </div>

              <div className="pl-3.5 border-l-2 border-gray-400/60 space-y-2.5 py-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Less COGS &amp; Expenses
                </div>

                <div className="flex justify-between items-center text-sm text-gray-700">
                  <span>Cost of Goods Sold (COGS)</span>
                  <span className="font-semibold text-gray-900">
                    ৳{formatBDT(cogs)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm text-gray-700">
                  <span>Operating Expenses</span>
                  <span className="font-semibold text-gray-900">
                    ৳{formatBDT(totalExpenses)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-300 flex justify-between items-baseline mt-6">
            <span className="font-bold text-gray-900">Net Profit</span>
            <span
              className={`text-2xl font-black ${
                netProfit >= 0 ? "text-emerald-800" : "text-red-700"
              }`}
            >
              ৳{formatBDT(netProfit)}
            </span>
          </div>
        </div>
      </div>

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSuccess={() => fetchData()}
      />
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, Download, Loader2, BarChart2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { createClient } from "@/utils/supabase/client";
import {
  calculateSavedOrderProfit,
  formatBDT,
  roundMoney,
} from "@/lib/calculations";

type Timeframe = "Today" | "Week" | "Month";

interface TrendPoint {
  name: string;
  sales: number;
  profit: number;
}

interface TopProductMetric {
  name: string;
  units: number;
  percentage: number;
}

interface CategoryMetric {
  name: string;
  units: number;
  percentage: number;
  color: string;
}

const CHART_COLORS = [
  "#111827",
  "#4b5563",
  "#9ca3af",
  "#d97706",
  "#059669",
  "#2563eb",
];

export default function AnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [timeframe, setTimeframe] = useState<Timeframe>("Week");
  const [loading, setLoading] = useState(true);

  const [totalSales, setTotalSales] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductMetric[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryMetric[]>([]);
  const [rangeLabel, setRangeLabel] = useState("");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date();

      if (timeframe === "Today") {
        start.setHours(0, 0, 0, 0);
      } else if (timeframe === "Week") {
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
      } else {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
      }

      const fmtShort = (d: Date) =>
        d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      setRangeLabel(
        timeframe === "Today"
          ? fmtShort(now)
          : `${fmtShort(start)} – ${fmtShort(now)}`
      );

      const [ordersRes, returnsRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, subtotal, grand_total, total_amount, status"
          )
          .gte("created_at", start.toISOString())
          .lte("created_at", now.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("sales_returns")
          .select("refund_amount, created_at")
          .gte("created_at", start.toISOString())
          .lte("created_at", now.toISOString()),
      ]);

      const validOrders = (ordersRes.data || []).filter(
        (o) =>
          o.status !== "Cancelled" &&
          (Number(o.total_amount) > 0 || Number(o.subtotal) > 0)
      );

      if (validOrders.length === 0) {
        setTotalSales(0);
        setTotalProfit(0);
        setTotalOrders(0);
        setAvgOrderValue(0);
        setTotalUnits(0);
        setTrendData([]);
        setTopProducts([]);
        setCategoryData([]);
        setLoading(false);
        return;
      }

      const orderIds = validOrders.map((o) => o.id);
      const { data: itemsData } = await supabase
        .from("order_items")
        .select(
          "order_id, product_id, quantity, unit_cost_price, products ( name, category, cost_price )"
        )
        .in("order_id", orderIds);

      const itemsByOrder = new Map<
        string,
        Array<{
          productId: string;
          productName: string;
          category: string;
          quantity: number;
          costPrice: number;
        }>
      >();

      for (const raw of itemsData || []) {
        const prod = raw.products as unknown as {
          name?: string;
          category?: string;
          cost_price?: number;
        } | null;
        const oid = String(raw.order_id);
        const list = itemsByOrder.get(oid) || [];
        const unitCost =
          raw.unit_cost_price !== null &&
          raw.unit_cost_price !== undefined &&
          Number(raw.unit_cost_price) > 0
            ? Number(raw.unit_cost_price)
            : Number(prod?.cost_price) || 0;

        list.push({
          productId: String(raw.product_id || ""),
          productName: prod?.name || "Unknown Product",
          category: prod?.category || "Uncategorized",
          quantity: Number(raw.quantity) || 0,
          costPrice: unitCost,
        });
        itemsByOrder.set(oid, list);
      }

      let salesAccum = 0;
      let profitAccum = 0;
      let unitsAccum = 0;

      const bucketMap = new Map<string, { sales: number; profit: number }>();
      const productUnitsMap = new Map<string, number>();
      const categoryUnitsMap = new Map<string, number>();

      for (const ord of validOrders) {
        // Equation 8: Use saved grand_total on the order so discounts reduce revenue & profit
        const savedGrand =
          ord.grand_total !== null &&
          ord.grand_total !== undefined &&
          (Number(ord.grand_total) > 0 || Number(ord.subtotal) > 0)
            ? Number(ord.grand_total)
            : Number(ord.total_amount) || 0;

        const ordItems = itemsByOrder.get(String(ord.id)) || [];
        const profitCalc = calculateSavedOrderProfit(
          savedGrand,
          ordItems.map((it) => ({
            costPrice: it.costPrice,
            quantity: it.quantity,
          }))
        );

        salesAccum = roundMoney(salesAccum + profitCalc.grandTotal);
        profitAccum = roundMoney(profitAccum + profitCalc.grossProfit);

        const d = new Date(ord.created_at);
        const bucketKey =
          timeframe === "Today"
            ? `${String(d.getHours()).padStart(2, "0")}:00`
            : d.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              });

        const existingBucket = bucketMap.get(bucketKey) || {
          sales: 0,
          profit: 0,
        };
        existingBucket.sales = roundMoney(
          existingBucket.sales + profitCalc.grandTotal
        );
        existingBucket.profit = roundMoney(
          existingBucket.profit + profitCalc.grossProfit
        );
        bucketMap.set(bucketKey, existingBucket);

        for (const it of ordItems) {
          unitsAccum += it.quantity;
          productUnitsMap.set(
            it.productName,
            (productUnitsMap.get(it.productName) || 0) + it.quantity
          );
          categoryUnitsMap.set(
            it.category,
            (categoryUnitsMap.get(it.category) || 0) + it.quantity
          );
        }
      }

      const refundsTotal = (returnsRes.data || []).reduce(
        (sum, r) => sum + (Number(r.refund_amount) || 0),
        0
      );
      const netSalesAfterReturns = Math.max(
        0,
        roundMoney(salesAccum - refundsTotal)
      );
      const netProfitAfterReturns = roundMoney(profitAccum - refundsTotal);

      setTotalSales(netSalesAfterReturns);
      setTotalProfit(netProfitAfterReturns);
      setTotalOrders(validOrders.length);
      setAvgOrderValue(
        validOrders.length > 0
          ? roundMoney(netSalesAfterReturns / validOrders.length)
          : 0
      );
      setTotalUnits(unitsAccum);

      setTrendData(
        Array.from(bucketMap.entries()).map(([name, vals]) => ({
          name,
          sales: vals.sales,
          profit: vals.profit,
        }))
      );

      const sortedProducts = Array.from(productUnitsMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const maxUnits = sortedProducts[0]?.[1] || 1;
      setTopProducts(
        sortedProducts.map(([name, units]) => ({
          name,
          units,
          percentage: Math.round((units / maxUnits) * 100),
        }))
      );

      const sortedCategories = Array.from(categoryUnitsMap.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      setCategoryData(
        sortedCategories.map(([name, units], idx) => ({
          name,
          units,
          percentage:
            unitsAccum > 0 ? Math.round((units / unitsAccum) * 100) : 0,
          color: CHART_COLORS[idx % CHART_COLORS.length],
        }))
      );
    } catch (err) {
      console.error("Failed loading analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, timeframe]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCSV = () => {
    const rows = [
      ["Period", "Sales (BDT)", "Gross Profit (BDT)"],
      ...trendData.map((pt) => [
        pt.name,
        pt.sales.toFixed(2),
        pt.profit.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rizq-analytics-${timeframe.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Analytics &amp; Reports
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Real-time discounted revenue and gross profit metrics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Toggle */}
          <div className="bg-[#e9e6df] rounded-xl p-1 flex items-center">
            {(["Today", "Week", "Month"] as Timeframe[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                  timeframe === t
                    ? "bg-black text-white"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="min-h-[42px] flex items-center gap-2 bg-white border border-gray-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-700">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>{rangeLabel || timeframe}</span>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={trendData.length === 0}
            className="min-h-[42px] flex items-center gap-2 bg-black px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between min-h-[116px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Net Sales
            </span>
            <span className="text-xs text-gray-400">{timeframe}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-3">
            ৳{formatBDT(totalSales)}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between min-h-[116px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Gross Profit
            </span>
            <span className="text-xs text-gray-400">{timeframe}</span>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black mt-3 ${
              totalProfit >= 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            ৳{formatBDT(totalProfit)}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between min-h-[116px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Total Orders
            </span>
            <span className="text-xs text-gray-400">{timeframe}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-3">
            {totalOrders.toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 flex flex-col justify-between min-h-[116px]">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Avg Order Value
            </span>
            <span className="text-xs text-gray-400">{timeframe}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-3">
            ৳{formatBDT(avgOrderValue)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-12 flex flex-col items-center justify-center gap-2 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Loading analytics...</span>
        </div>
      ) : trendData.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#f3f0ea] flex items-center justify-center mx-auto mb-3">
            <BarChart2 className="w-6 h-6 text-gray-700" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            No sales recorded for this period yet
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto">
            Complete sales in the POS to view live sales trends, profit margins,
            and top-selling shoe categories here.
          </p>
        </div>
      ) : (
        <>
          {/* Sales & Profit Trend Chart */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200/80 mb-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                Sales &amp; Profit Trend
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-black" />
                  <span className="text-xs font-semibold text-gray-600">
                    Sales
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <span className="text-xs font-semibold text-gray-600">
                    Gross Profit
                  </span>
                </div>
              </div>
            </div>

            <div className="h-[260px] sm:h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 8, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#111827" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#111827" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f0f0f0"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(value) =>
                      value >= 1000
                        ? `৳${(value / 1000).toFixed(1)}k`
                        : `৳${value}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      borderRadius: "12px",
                      border: "none",
                      color: "#fff",
                    }}
                    itemStyle={{ color: "#fff", fontSize: "12px" }}
                    labelStyle={{
                      color: "#9ca3af",
                      marginBottom: "4px",
                      fontSize: "11px",
                    }}
                    formatter={(value: unknown) => [
                      `৳${formatBDT(Number(value) || 0)}`,
                      "",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke="#111827"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorSales)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Gross Profit"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
            {/* Top Selling Products */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Top Selling Shoes
                </h3>
                <span className="text-xs font-semibold text-gray-500">
                  Units Sold
                </span>
              </div>

              {topProducts.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No item data available.
                </p>
              ) : (
                <div className="space-y-4">
                  {topProducts.map((product, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between gap-2 text-sm font-semibold text-gray-900 mb-1.5">
                        <span className="truncate">{product.name}</span>
                        <span className="shrink-0 font-bold">
                          {product.units}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-gray-900 h-2 rounded-full"
                          style={{ width: `${product.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sales by Category */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                Units by Category
              </h3>

              {categoryData.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No category breakdown available.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-44 h-44 relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={74}
                          paddingAngle={2}
                          dataKey="units"
                          stroke="none"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xl font-black text-gray-900">
                        {totalUnits}
                      </span>
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">
                        Units
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-3">
                    {categoryData.map((cat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm font-semibold text-gray-800 truncate">
                            {cat.name}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-gray-600 shrink-0">
                          {cat.units} ({cat.percentage}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { 
  FileText, 
  AlertTriangle, 
  Users, 
  TrendingUp, 
  ChevronRight,
  AlertCircle,
  Calendar,
  Bell,
  UserCircle,
  Zap,
  Building,
  ChevronDown,
  ClipboardList,
  Store,
  Contact,
  Banknote,
  Plus,
  Receipt,
  Undo2
} from "lucide-react";
import AddExpenseModal from "@/components/AddExpenseModal";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const formatPrice = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Data states
  type TopProduct = { name: string; quantity: number; revenue: number };
  const [timeFilter, setTimeFilter] = useState<"Today" | "This Month" | "Custom Range">("Today");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [sales, setSales] = useState(0); // net_sales
  const [grossSales, setGrossSales] = useState(0);
  const [returnsValue, setReturnsValue] = useState(0);
  const [cogs, setCogs] = useState(0);
  const [purchases, setPurchases] = useState(0);
  const [expenses, setExpenses] = useState<{description: string, amount: number}[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  // Modal
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
      } else {
        setUserEmail(user.email ?? null);
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
        
        // Swap dates if start is after end
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
        const today = new Date();
        let startDate = new Date();
        
        if (timeFilter === "Today") {
          startDate.setHours(0,0,0,0);
        } else {
          startDate.setDate(1); // First day of the month
          startDate.setHours(0,0,0,0);
        }
        
        startIso = startDate.toISOString();
        endIso = today.toISOString(); 
        startStr = startDate.toLocaleDateString("en-CA");
        endStr = today.toLocaleDateString("en-CA");
      }

      // 1. Fetch Summary via RPC
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_summary', {
        _date_from: startIso,
        _date_to: endIso
      });

      if (!summaryError && summaryData) {
        setGrossSales(summaryData.gross_sales || 0);
        setReturnsValue(summaryData.returns_selling_value || 0);
        setSales(summaryData.net_sales || 0);
        setCogs(summaryData.cogs || 0);
        setTotalExpenses(summaryData.total_expenses || 0);
        setNetProfit(summaryData.net_profit || 0);
        setPurchases(summaryData.net_purchases || 0);
      }

      // 1.5 Fetch Orders to calculate Top Products
      const { data: salesData } = await supabase
        .from("orders")
        .select("id")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      if (salesData && salesData.length > 0) {
        const orderIds = salesData.map(o => o.id);
        
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("product_id, quantity, price")
          .in("order_id", orderIds);
          
        if (itemsData && itemsData.length > 0) {
          const productStats: Record<string, { quantity: number, revenue: number }> = {};
          const productIds = new Set<string>();
          
          for (const item of itemsData) {
            if (!item.product_id) continue;
            productIds.add(item.product_id);
            if (!productStats[item.product_id]) {
              productStats[item.product_id] = { quantity: 0, revenue: 0 };
            }
            productStats[item.product_id].quantity += (item.quantity || 0);
            productStats[item.product_id].revenue += ((item.quantity || 0) * (item.price || 0));
          }
          
          const { data: productsData } = await supabase
            .from("products")
            .select("id, name")
            .in("id", Array.from(productIds));
            
          const productMap: Record<string, string> = {};
          if (productsData) {
            for (const p of productsData) {
              productMap[p.id] = p.name;
            }
          }
          
          const topArr: TopProduct[] = Object.entries(productStats).map(([pId, stats]) => ({
            name: productMap[pId] || "Unknown Product",
            quantity: stats.quantity,
            revenue: stats.revenue
          }));
          
          topArr.sort((a, b) => b.revenue - a.revenue);
          setTopProducts(topArr.slice(0, 5));
        } else {
          setTopProducts([]);
        }
      } else {
        setTopProducts([]);
      }

      // 3. Fetch Expenses Details for List
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
      if (timeFilter === "Custom Range" && (!customStartDate || !customEndDate)) return;
      fetchData();
    }
  }, [loading, timeFilter, customStartDate, customEndDate, fetchData]);

  if (loading) return <div className="p-10 flex-1 h-full flex items-center justify-center">Loading...</div>;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8 no-scrollbar relative">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <p className="text-sm font-semibold text-gray-500">Good Morning, Owner</p>
          <h1 className="text-3xl font-black text-gray-900 mt-1">Dashboard</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button className="flex items-center space-x-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </button>
          <button className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm">
            <Bell className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm">
            <UserCircle className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Summary Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <h2 className="text-[22px] font-bold text-[#1e293b]">Summary</h2>
        <div className="flex items-center gap-3">
          {timeFilter === "Custom Range" && (
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={customStartDate} 
                onChange={e => setCustomStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
              />
              <span className="text-gray-400">to</span>
              <input 
                type="date" 
                value={customEndDate} 
                onChange={e => setCustomEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}
          <div className="relative">
            <select 
              value={timeFilter}
              onChange={(e) => {
                setTimeFilter(e.target.value as any);
                if (e.target.value !== "Custom Range") {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }
              }}
              className="appearance-none flex items-center space-x-2 bg-white border border-gray-200 pl-4 pr-10 py-2 rounded-xl text-sm font-semibold text-[#1e293b] hover:bg-gray-50 transition-colors shadow-sm focus:outline-none cursor-pointer"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 relative">
        {loadingData && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
            <span className="text-sm font-semibold text-gray-500">Calculating...</span>
          </div>
        )}

        {/* Net Sales */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[#334155] text-[17px] tracking-tight font-medium">Net Sales</span>
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100">
              <ClipboardList className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[#0f172a]">৳ {formatPrice(sales)}</div>
        </div>

        {/* Returns */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[#334155] text-[17px] tracking-tight font-medium">Returns</span>
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
              <Undo2 className="w-4 h-4 text-red-500" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[#0f172a]">৳ {formatPrice(returnsValue)}</div>
        </div>

        {/* Outstanding Dues */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[#334155] text-[17px] tracking-tight font-medium">Outstanding<br/>Dues</span>
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100">
              <Contact className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[#0f172a]">৳ {formatPrice(0)}</div>
        </div>

        {/* Net Profit */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[#334155] text-[17px] tracking-tight font-medium">Net Profit</span>
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center border border-green-100">
              <Banknote className="w-4 h-4 text-green-500" />
            </div>
          </div>
          <div className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ৳ {formatPrice(netProfit)}
          </div>
        </div>
      </div>

      {/* List Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-900">Product Sales ({timeFilter})</h2>
          <button className="text-sm font-semibold text-gray-500 hover:text-gray-900 flex items-center">
            See All <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        <div className="space-y-4">
          {loadingData ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading...</div>
          ) : topProducts.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">No product sales found for this period.</div>
          ) : (
            topProducts.map((p, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{p.name}</h4>
                  <p className="text-xs text-gray-500 font-medium">{p.quantity} units sold</p>
                </div>
                <div className="text-sm font-bold text-gray-900">৳ {formatPrice(p.revenue)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Expenses & Profit Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        
        {/* Left Column - Expenses List */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900">Expenses ({timeFilter})</h2>
            <button 
              onClick={() => setIsExpenseModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {loadingData ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading...</div>
            ) : expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                  <Receipt className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">No expenses recorded for {timeFilter.toLowerCase()}.</p>
                <p className="text-xs text-gray-400 mt-1">Click "Add Expense" to start tracking.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {expenses.map((exp, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-gray-50 pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="text-sm font-semibold text-gray-800">{exp.description}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">৳ {formatPrice(exp.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Breakdown */}
        <div className="bg-[#e9e6df] p-6 rounded-2xl border border-gray-200 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">Net Profit Breakdown</h2>
              <span className="text-xs font-bold text-gray-600 bg-white/50 px-2 py-1 rounded-md">
                {timeFilter}
              </span>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm text-gray-600 pb-1">
                <span>Gross Sales</span>
                <span>৳ {formatPrice(grossSales)}</span>
              </div>
              
              {returnsValue > 0 && (
                <div className="flex justify-between items-center text-sm text-red-500 pb-1">
                  <span>Returns (Refunds)</span>
                  <span>-৳ {formatPrice(returnsValue)}</span>
                </div>
              )}

              <div className="flex justify-between items-center font-medium text-sm text-gray-900 border-t border-gray-200 pt-2 pb-2">
                <span>Total Net Sales</span>
                <span className="font-bold">৳ {formatPrice(sales)}</span>
              </div>
              
              <div className="pl-4 border-l-2 border-gray-300 space-y-3 pb-2">
                <div className="text-[10px] font-bold italic text-gray-500 mb-1">- minus COGS & Expenses</div>
                
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>Cost of Goods Sold (COGS)</span>
                  <span className="font-semibold text-gray-800">৳ {formatPrice(cogs)}</span>
                </div>

                {expenses.length === 0 ? (
                  <div className="text-sm text-gray-500 italic mt-2">No manual expenses</div>
                ) : (
                  expenses.map((exp, i) => (
                    <div key={i} className="flex justify-between items-center text-sm text-gray-600">
                      <span>{exp.description}</span>
                      <span className="font-semibold text-gray-800">৳ {formatPrice(exp.amount)}</span>
                    </div>
                  ))
                )}
                
                {expenses.length > 0 && (
                  <div className="flex justify-between items-center text-sm text-gray-900 pt-2 border-t border-gray-300/50 mt-2">
                    <span className="font-semibold">Total Expenses</span>
                    <span className="font-bold text-red-600">৳ {formatPrice(totalExpenses)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-300 flex justify-between items-center mt-6">
            <span className="font-bold text-gray-900">Net Profit</span>
            <span className={`text-2xl font-black ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              ৳ {formatPrice(netProfit)}
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

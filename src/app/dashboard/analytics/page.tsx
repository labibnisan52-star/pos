"use client";

import React, { useState } from "react";
import { 
  Calendar, 
  Download,
  TrendingUp,
  TrendingDown,
  MoreHorizontal
} from "lucide-react";
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
  Cell
} from "recharts";

// --- MOCK DATA ---

const salesData = [
  { name: 'Mon', sales: 7000, profit: 3000 },
  { name: 'Tue', sales: 9000, profit: 4500 },
  { name: 'Wed', sales: 11000, profit: 5000 },
  { name: 'Thu', sales: 21000, profit: 9000 },
  { name: 'Fri', sales: 26000, profit: 13000 },
  { name: 'Sat', sales: 35200, profit: 12400 },
  { name: 'Sun', sales: 28000, profit: 10000 },
];

const categoryData = [
  { name: 'Beverages', value: 45, color: '#000000' },
  { name: 'Equipment', value: 30, color: '#a3a3a3' },
  { name: 'Supplies', value: 25, color: '#e5e5e5' },
];

const topProducts = [
  { name: 'Artisan Coffee Beans (1kg)', units: 142, percentage: 100 },
  { name: 'Ceramic Pour-over Dripper', units: 98, percentage: 69 },
  { name: 'Oat Milk Barista Edition', units: 76, percentage: 53 },
  { name: 'Disposable Cups (500ct)', units: 45, percentage: 31 },
];

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState("Week");

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        
        <div className="flex items-center space-x-3">
          {/* Timeframe Toggle */}
          <div className="bg-[#e9e6df] rounded-lg p-1 flex items-center">
            {["Today", "Week", "Month"].map(t => (
              <button 
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  timeframe === t ? "bg-black text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Date Range */}
          <button className="flex items-center space-x-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>Oct 1 - Oct 7</span>
          </button>

          {/* Export */}
          <button className="flex items-center space-x-2 bg-black px-4 py-2 rounded-lg text-sm font-medium text-white hover:bg-gray-800 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Sales */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Sales</span>
            <span className="text-xs text-gray-400">This Week</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-4xl font-black text-gray-900">TK245k</div>
            <div className="flex items-center text-sm font-bold text-green-600 mb-1">
              <TrendingUp className="w-4 h-4 mr-0.5" /> 12%
            </div>
          </div>
        </div>

        {/* Total Profit */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Profit</span>
            <span className="text-xs text-gray-400">This Week</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-4xl font-black text-gray-900">TK82k</div>
            <div className="flex items-center text-sm font-bold text-green-600 mb-1">
              <TrendingUp className="w-4 h-4 mr-0.5" /> 8%
            </div>
          </div>
        </div>

        {/* Total Orders */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Orders</span>
            <span className="text-xs text-gray-400">This Week</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-4xl font-black text-gray-900">1,240</div>
            <div className="flex items-center text-sm font-bold text-red-500 mb-1">
              <TrendingDown className="w-4 h-4 mr-0.5" /> 5%
            </div>
          </div>
        </div>

        {/* Avg Order Value */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Average Order Value</span>
            <span className="text-xs text-gray-400">This Week</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-4xl font-black text-gray-900">TK197</div>
            <div className="flex items-center text-sm font-bold text-green-600 mb-1">
              <TrendingUp className="w-4 h-4 mr-0.5" /> 4%
            </div>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Sales Trend</h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
              <span className="text-xs font-semibold text-gray-600">Sales</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#a3a3a3]"></div>
              <span className="text-xs font-semibold text-gray-600">Profit</span>
            </div>
            <div className="flex border border-gray-200 rounded-md overflow-hidden ml-4">
              <button className="px-2 py-1 bg-gray-50 border-r border-gray-200 text-gray-600"><TrendingUp className="w-3.5 h-3.5" /></button>
              <button className="px-2 py-1 bg-white text-gray-400"><MoreHorizontal className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
        
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#000000" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#000000" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(value) => `${value / 1000}k`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#000', borderRadius: '8px', border: 'none', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#9ca3af', marginBottom: '4px', fontSize: '12px' }}
                formatter={(value: any) => [`TK ${Number(value).toLocaleString()}`, '']}
              />
              <Area type="monotone" dataKey="sales" stroke="#000000" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              <Area type="monotone" dataKey="profit" stroke="#a3a3a3" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
        {/* Top Selling Products */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Top Selling Products</h3>
            <span className="text-xs font-semibold text-gray-500">Units</span>
          </div>
          
          <div className="space-y-5">
            {topProducts.map((product, idx) => (
              <div key={idx}>
                <div className="flex justify-between text-sm font-semibold text-gray-900 mb-2">
                  <span>{product.name}</span>
                  <span>{product.units}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-black h-2 rounded-full" 
                    style={{ width: `${product.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by Category */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Sales by Category</h3>
            <button className="text-gray-400 hover:text-gray-900">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center h-[200px]">
            <div className="w-1/2 h-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-gray-900">1.2k</span>
                <span className="text-[10px] text-gray-400 font-semibold uppercase">Total Units</span>
              </div>
            </div>
            
            <div className="w-1/2 pl-6 space-y-4">
              {categoryData.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }}></div>
                    <span className="text-sm font-semibold text-gray-700">{cat.name}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-500">{cat.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  TrendingUp,
  Package,
  TriangleAlert
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import AddStockModal from "@/components/AddStockModal";
import AddProductModal from "@/components/AddProductModal";

type ProductVariant = {
  id: string;
  image_url: string;
  variant_name: string;
  variant_value: string;
  sku: string;
  price?: number;
  stock_multiplier?: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  cost_price?: number;
  stock: number;
  category: string;
  image_color: string;
  image_url?: string;
  barcode?: string;
  unit?: string;
  product_type?: string;
  brand?: string;
  tax_rate?: number;
  tax_type?: string;
  description?: string;
  warranty?: string;
  variants?: ProductVariant[];
};

type SalesHistoryItem = {
  id: string;
  quantity: number;
  price: number;
  unit_cost_price?: number;
  unit_selling_price?: number;
  created_at: string;
  orders: {
    customer_name: string;
    customer_mobile: string;
  };
};

export default function ProductDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryItem[]>([]);
  const [fifoStockValue, setFifoStockValue] = useState<number>(0);
  const [activeBatches, setActiveBatches] = useState<{id: string, created_at: string, remaining_quantity: number, unit_cost: number}[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchCustomer, setSearchCustomer] = useState("");
  const [dateRange, setDateRange] = useState("All Time");
  const [customMonth, setCustomMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        alert("Failed to delete product: " + error.message);
      } else {
        router.push("/dashboard/products");
      }
    }
  };

  const fetchProduct = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
      
    if (data) {
      let variantsData: ProductVariant[] = [];
      if (data.product_type === "Variable Product") {
        const { data: vData } = await supabase
          .from("product_variants")
          .select("*")
          .eq("product_id", id);
        if (vData) variantsData = vData;
      }
      setProduct({ ...data, variants: variantsData });

      // Calculate FIFO Stock Value
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('id, created_at, remaining_quantity, total_cost, quantity')
        .eq('product_id', id)
        .gt('remaining_quantity', 0)
        .order('created_at', { ascending: true });
        
      let value = 0;
      let accountedStock = 0;
      const parsedBatches: {id: string, created_at: string, remaining_quantity: number, unit_cost: number}[] = [];
      
      if (poData && poData.length > 0) {
        for (const po of poData) {
          const unitCost = po.total_cost / po.quantity;
          value += po.remaining_quantity * unitCost;
          accountedStock += po.remaining_quantity;
          parsedBatches.push({
            id: po.id,
            created_at: po.created_at,
            remaining_quantity: po.remaining_quantity,
            unit_cost: unitCost
          });
        }
      }
      
      // Fallback for stock without POs (e.g. initial stock before PO system)
      if (data.stock > accountedStock) {
        const fallbackCost = data.cost_price || 0;
        const fallbackQty = data.stock - accountedStock;
        value += fallbackQty * fallbackCost;
        parsedBatches.unshift({
           id: "fallback-initial",
           created_at: "Legacy Stock (No Date)",
           remaining_quantity: fallbackQty,
           unit_cost: fallbackCost
        });
      }
      setFifoStockValue(value);
      setActiveBatches(parsedBatches);
    }

    // Fetch sales history
    const { data: salesData } = await supabase
      .from('order_items')
      .select(`
        id,
        quantity,
        price,
        unit_cost_price,
        unit_selling_price,
        created_at,
        orders ( customer_name, customer_mobile )
      `)
      .eq('product_id', id)
      .order('created_at', { ascending: false });

    if (salesData) {
      setSalesHistory(salesData as any);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    if (id) {
      fetchProduct();
    }
  }, [id, supabase]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }

  if (!product) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Product not found.</div>;
  }

  const costPrice = product.cost_price || 0;
  
  // Dynamic Calculations
  const unitsSold = salesHistory.reduce((sum, item) => sum + item.quantity, 0);
  const totalProfit = salesHistory.reduce((sum, item) => {
    const cost = item.unit_cost_price || costPrice;
    const revenue = item.price || item.unit_selling_price || 0;
    return sum + (revenue - cost) * item.quantity;
  }, 0);

  // Dynamic Monthly Trend (Last 7 months)
  const generateSalesTrend = () => {
    const trend: { name: string; sales: number; year: number; monthIndex: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(1); // Set to the 1st of the month to prevent overflow on months with fewer days
      d.setMonth(d.getMonth() - i);
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      trend.push({ name: monthName, sales: 0, year: d.getFullYear(), monthIndex: d.getMonth() });
    }
    
    salesHistory.forEach(item => {
      const itemDate = new Date(item.created_at);
      const monthItem = trend.find(t => t.year === itemDate.getFullYear() && t.monthIndex === itemDate.getMonth());
      if (monthItem) {
        monthItem.sales += item.quantity;
      }
    });
    
    return trend;
  };
  
  const salesTrendData = generateSalesTrend();

  const filteredSalesHistory = salesHistory.filter(item => {
    // Search
    if (searchCustomer) {
      const custName = (item.orders?.customer_name || "Guest").toLowerCase();
      const custMobile = (item.orders?.customer_mobile || "").toLowerCase();
      const q = searchCustomer.toLowerCase();
      if (!custName.includes(q) && !custMobile.includes(q)) return false;
    }
    
    // Date Range
    if (dateRange !== "All Time") {
      const d = new Date(item.created_at);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - d.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (dateRange === "Last 7 Days" && diffDays > 7) return false;
      else if (dateRange === "Last 30 Days" && diffDays > 30) return false;
      else if (dateRange === "This Month") {
         if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      }
      else if (dateRange === "Custom Month" && customMonth) {
         const [year, month] = customMonth.split("-").map(Number);
         if (d.getFullYear() !== year || d.getMonth() !== (month - 1)) return false;
      }
    }

    // Status filter - Order Items are assumed Completed unless we have complex statuses
    if (statusFilter !== "All" && statusFilter !== "Completed") return false; 
    
    return true;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#f0f2f5] p-6 lg:p-8 no-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-200 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <div className="text-sm text-gray-500 font-medium mt-0.5">SKU: {product.barcode || "N/A"}</div>
          </div>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={() => setShowAddStockModal(true)}
            className="px-4 py-2 bg-[#4361ee] text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-1.5"
          >
            <span>+</span> Add New Stock
          </button>
          <button 
            onClick={() => setIsEditModalOpen(true)}
            className="px-4 py-2 bg-[#6c757d] text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center gap-1.5"
          >
            <Edit className="w-4 h-4" /> Edit
          </button>
          <button 
            onClick={handleDelete}
            className="px-4 py-2 bg-[#343a40] text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors text-sm flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left Column (White Card) */}
        <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-fit">
           <div className={`w-full aspect-square rounded-xl ${product.image_color || 'bg-gray-100'} border border-gray-100 overflow-hidden relative mb-6`}>
             {product.image_url ? (
               <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
             ) : (
               <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">No Image</div>
             )}
           </div>

           <div className="grid grid-cols-2 gap-y-6 gap-x-4">
             <div>
               <div className="text-sm font-semibold text-gray-900">{product.category}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Metadata</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">{product.product_type || "Single Product"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Type</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">{product.unit || "Piece"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Unit</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">{product.brand || "N/A"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Brand</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">TK {product.price.toLocaleString()}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Selling Price</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">TK {costPrice.toLocaleString()}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Cost Price</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">{product.tax_rate ? `${product.tax_rate}%` : "0%"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Tax Rate</div>
             </div>
             <div>
               <div className="text-sm font-semibold text-gray-900">{product.tax_type || "N/A"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Tax Type</div>
             </div>
             <div className="col-span-2">
               <div className="text-sm font-semibold text-gray-900">{product.warranty || "No Warranty"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Warranty</div>
             </div>
             <div className="col-span-2">
               <div className="text-sm font-semibold text-gray-900 line-clamp-3">{product.description || "No description provided"}</div>
               <div className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5">Description</div>
             </div>
           </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-9 flex flex-col space-y-6">
          {/* Top Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
               <div>
                 <h3 className="text-sm font-semibold text-gray-600 mb-1 flex items-center gap-2">Current Stock <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">In Stock</span></h3>
                 <div className="text-4xl font-black text-gray-900 flex items-end gap-2">
                   {product.stock}
                   <span className="text-sm font-medium text-gray-500 mb-1">{product.unit}s</span>
                 </div>
                 {product.product_type === "Variable Product" && product.variants && product.variants.length > 0 && (
                   <div className="text-xs font-semibold text-gray-500 mt-1 bg-gray-50 p-1.5 rounded-lg border border-gray-100 w-fit">
                     {(() => {
                       const validVariants = [...product.variants]
                         .filter((v: any) => v.stock_multiplier && v.stock_multiplier > 0)
                         .sort((a: any, b: any) => b.stock_multiplier - a.stock_multiplier);
                       
                       let remaining = product.stock;
                       const parts = [];
                       for (const v of validVariants) {
                         const multiplier = v.stock_multiplier || 1;
                         const qty = Math.floor(remaining / multiplier);
                         if (qty > 0) {
                           parts.push(`${qty}x ${v.variant_value}`);
                           remaining = remaining % multiplier;
                         }
                       }
                       return parts.length > 0 ? parts.join(' + ') : "0 units";
                     })()}
                   </div>
                 )}
               </div>
               <div className="w-10 h-10 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-gray-600">
                 <Package className="w-5 h-5" />
               </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
               <div>
                 <h3 className="text-sm font-semibold text-gray-600 mb-1">Inventory Value</h3>
                 <div className="text-4xl font-black text-gray-900">TK {Math.round(fifoStockValue).toLocaleString()}</div>
               </div>
               <div className="text-blue-600 flex items-center justify-center">
                 <TrendingUp className="w-6 h-6 stroke-[3]" />
               </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
               <div>
                 <h3 className="text-sm font-semibold text-gray-600 mb-1">Low Stock Alerts</h3>
                 <div className="text-4xl font-black text-gray-900 flex items-baseline gap-2">{product.stock <= 5 ? "1" : "0"} <span className="text-lg font-bold text-orange-600">items</span></div>
               </div>
               <div className="text-orange-500 flex items-center justify-center">
                 <TriangleAlert className="w-6 h-6 stroke-[2]" />
               </div>
            </div>
          </div>

          {/* Sales History */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-gray-900">Sales History</h3>
               <div className="flex gap-2">
                  <div className="flex border border-gray-200 rounded-lg focus-within:ring-1 focus-within:ring-gray-300 overflow-hidden bg-white h-[34px]">
                    <select 
                      value={dateRange}
                      onChange={(e) => {
                        setDateRange(e.target.value);
                        if (e.target.value === "Custom Month" && !customMonth) {
                          const now = new Date();
                          setCustomMonth(`${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`);
                        }
                      }}
                      className="px-3 py-1.5 text-sm text-gray-600 font-medium bg-transparent focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="All Time">📅 Date Range</option>
                      <option value="Last 7 Days">Last 7 Days</option>
                      <option value="Last 30 Days">Last 30 Days</option>
                      <option value="This Month">This Month</option>
                      <option value="Custom Month">Specific Month...</option>
                    </select>
                    {dateRange === "Custom Month" && (
                      <div className="flex items-center border-l border-gray-200 bg-transparent pr-2">
                        <select 
                          className="px-2 py-1 text-sm text-gray-600 bg-transparent focus:outline-none cursor-pointer appearance-none text-center"
                          value={customMonth ? customMonth.split("-")[1] : (new Date().getMonth() + 1).toString().padStart(2, '0')}
                          onChange={(e) => {
                             const year = customMonth ? customMonth.split("-")[0] : new Date().getFullYear();
                             setCustomMonth(`${year}-${e.target.value}`);
                          }}
                        >
                          <option value="01">Jan</option>
                          <option value="02">Feb</option>
                          <option value="03">Mar</option>
                          <option value="04">Apr</option>
                          <option value="05">May</option>
                          <option value="06">Jun</option>
                          <option value="07">Jul</option>
                          <option value="08">Aug</option>
                          <option value="09">Sep</option>
                          <option value="10">Oct</option>
                          <option value="11">Nov</option>
                          <option value="12">Dec</option>
                        </select>
                        <select 
                          className="py-1 text-sm text-gray-600 bg-transparent focus:outline-none cursor-pointer appearance-none text-center font-medium"
                          value={customMonth ? customMonth.split("-")[0] : new Date().getFullYear()}
                          onChange={(e) => {
                             const month = customMonth ? customMonth.split("-")[1] : (new Date().getMonth() + 1).toString().padStart(2, '0');
                             setCustomMonth(`${e.target.value}-${month}`);
                          }}
                        >
                          {Array.from({length: 10}, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input 
                      type="text"
                      placeholder="Search Customer"
                      value={searchCustomer}
                      onChange={(e) => setSearchCustomer(e.target.value)}
                      className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 font-normal bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 w-40 placeholder:text-gray-400"
                    />
                  </div>
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 font-medium bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 appearance-none cursor-pointer"
                  >
                    <option value="All">Status ⌄</option>
                    <option value="Completed">Completed</option>
                  </select>
               </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100/50 border-b border-gray-100 text-[11px] font-bold text-gray-700">
                    <th className="px-4 py-3 rounded-tl-lg rounded-bl-lg">Date</th>
                    <th className="px-4 py-3">Customer Name</th>
                    <th className="px-4 py-3">Customer Mobile</th>
                    <th className="px-4 py-3">Quantity Sold</th>
                    <th className="px-4 py-3 rounded-tr-lg rounded-br-lg">Price Paid</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-semibold text-gray-600 divide-y divide-gray-50">
                  {filteredSalesHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No sales history found.</td>
                    </tr>
                  ) : (
                    filteredSalesHistory.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="px-4 py-4">{new Date(item.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-4">{item.orders?.customer_name || "Guest"}</td>
                        <td className="px-4 py-4">{item.orders?.customer_mobile || "—"}</td>
                        <td className="px-4 py-4">{item.quantity}</td>
                        <td className="px-4 py-4">TK {item.price.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Stock Batches</h3>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100/50 border-b border-gray-100 text-[11px] font-bold text-gray-700">
                      <th className="px-4 py-3 rounded-tl-lg rounded-bl-lg">Date Added</th>
                      <th className="px-4 py-3">Unit Cost Price</th>
                      <th className="px-4 py-3 rounded-tr-lg rounded-br-lg">Quantity Available</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-semibold text-gray-600 divide-y divide-gray-50">
                    {activeBatches.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-400">No active stock batches found.</td>
                      </tr>
                    ) : (
                      activeBatches.map((batch, idx) => (
                        <tr key={batch.id}>
                          <td className="px-4 py-4">
                            {batch.created_at.includes("Legacy") 
                              ? <span className="text-gray-400">{batch.created_at}</span>
                              : <>{new Date(batch.created_at).toLocaleDateString('en-GB')}</>}
                          </td>
                          <td className="px-4 py-4 text-gray-900">TK {Math.round(batch.unit_cost).toLocaleString()}</td>
                          <td className="px-4 py-4">{batch.remaining_quantity}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Monthly Sales Trend</h3>
                <span className="text-gray-400 font-black cursor-pointer">···</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesTrendData.slice().reverse()}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#9ca3af'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#9ca3af'}} width={25} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}/>
                    <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <AddStockModal 
        isOpen={showAddStockModal} 
        onClose={() => setShowAddStockModal(false)}
        onSuccess={() => {
          fetchProduct();
        }}
        productId={product.id}
        productName={product.name}
        currentStock={product.stock}
      />
      
      <AddProductModal 
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={fetchProduct}
        productToEdit={product as any}
      />
    </div>
  );
}

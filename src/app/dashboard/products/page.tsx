"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  Plus, 
  LayoutGrid, 
  List, 
  Edit2, 
  Trash2, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Bell,
  UserCircle,
  Printer,
  Loader2
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import AddProductModal from "@/components/AddProductModal";
import NiimbotLabelPrint from "@/components/NiimbotLabelPrint";

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  barcode: string;
  image_color: string;
  image_url?: string;
  unit?: string;
  product_type?: string;
  brand?: string;
  tax_rate?: string;
  tax_type?: string;
  description?: string;
  warranty?: string;
  cost_price?: number;
};

export default function InventoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  
  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [filterStatus, setFilterStatus] = useState("All");



  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, [supabase]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      await supabase.from('products').delete().eq('id', id);
      fetchProducts();
    }
  };

  // Derived metrics
  const totalProducts = products.length;
  const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= 5).length;
  const outOfStock = products.filter(p => p.stock === 0).length;
  const totalValue = products.reduce((sum, p) => sum + ((p.cost_price || 0) * p.stock), 0);

  // Filtered List
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || "").includes(search);
      const matchCategory = filterCategory === "All Categories" || p.category === filterCategory;
      let matchStatus = true;
      if (filterStatus === "In Stock") matchStatus = p.stock > 5;
      if (filterStatus === "Low Stock") matchStatus = p.stock > 0 && p.stock <= 5;
      if (filterStatus === "Out of Stock") matchStatus = p.stock === 0;
      
      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, search, filterCategory, filterStatus]);

  const categories = ["All Categories", ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f6f0] p-6 overflow-y-auto font-sans relative">
      
      {/* Top Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-black text-white rounded-full font-semibold text-sm flex items-center hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-900 bg-white rounded-full shadow-sm">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-900 bg-white rounded-full shadow-sm">
            <UserCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">Total Products</p>
          <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-start">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Low Stock Items</p>
            <p className="text-2xl font-bold text-red-600 flex items-center">
              {lowStockItems}
              <AlertTriangle className="w-5 h-5 ml-2 text-red-500" />
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">Total Inventory Value</p>
          <p className="text-2xl font-bold text-gray-900">৳ {totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">Out of Stock</p>
          <p className="text-2xl font-bold text-gray-900">{outOfStock}</p>
        </div>
      </div>

      {/* Main Content Area (Table) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-[500px]">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex space-x-3 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input 
                type="text" 
                placeholder="Search products..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#f3f0ea] text-gray-900 placeholder-gray-500 border-transparent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            
            <div className="relative flex-shrink-0">
              <select 
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="pl-4 pr-8 py-2 bg-[#f3f0ea] text-gray-900 border-transparent rounded-lg text-sm font-medium focus:outline-none appearance-none"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex bg-[#f3f0ea] rounded-full p-1">
              {["All", "In Stock", "Low Stock", "Out of Stock"].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    filterStatus === status 
                      ? "bg-white text-gray-900 shadow-sm" 
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="flex bg-[#f3f0ea] rounded-lg p-1">
              <button className="p-1.5 bg-white rounded-md shadow-sm"><LayoutGrid className="w-4 h-4 text-gray-900" /></button>
              <button className="p-1.5 text-gray-400 hover:text-gray-900"><List className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Item</th>
                <th className="px-6 py-4 font-semibold">Product Name</th>
                <th className="px-6 py-4 font-semibold">Barcode</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold text-right">Price (৳)</th>
                <th className="px-6 py-4 font-semibold text-right">Stock Qty</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">Loading inventory...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">No products found.</td>
                </tr>
              ) : (
                filteredProducts.map(product => {
                  let statusText = "IN STOCK";
                  let statusClass = "bg-white border-gray-200 text-gray-700";
                  if (product.stock === 0) {
                    statusText = "OUT OF STOCK";
                    statusClass = "bg-black text-white border-black";
                  } else if (product.stock <= 5) {
                    statusText = "LOW STOCK";
                    statusClass = "bg-[#d1bfae] text-gray-900 border-[#d1bfae]"; // Mocking a brownish/amber color from design
                  }

                  return (
                    <tr 
                      key={product.id} 
                      onClick={() => router.push(`/dashboard/products/${product.id}`)}
                      className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className={`w-12 h-12 rounded-lg ${product.image_color || 'bg-gray-100'} flex items-center justify-center text-gray-400 border border-gray-100 overflow-hidden`}>
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <LayoutGrid className="w-5 h-5 opacity-50" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 font-semibold text-gray-900">{product.name}</td>
                      <td className="px-6 py-3 text-gray-400 text-xs tracking-wider">{product.barcode || "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{product.category}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{product.price.toFixed(2)}</td>
                      <td className={`px-6 py-3 text-right font-semibold ${product.stock <= 5 ? "text-red-500" : "text-gray-900"}`}>
                        {product.stock} <span className="text-gray-500 text-xs font-normal">{product.unit || ""}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold border tracking-wide ${statusClass}`}>
                          {statusText}
                        </span>
                      </td>
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <NiimbotLabelPrint
                            productName={product.name}
                            productPrice={product.price}
                            barcodeValue={product.barcode}
                          >
                            {(triggerPrint, printStatus) => (
                              <button 
                                onClick={(e) => { e.stopPropagation(); triggerPrint(); }} 
                                title={printStatus.isConnecting ? "Connecting to NIIMBOT..." : printStatus.isPrinting ? "Printing..." : "Print Label (NIIMBOT)"}
                                disabled={printStatus.isConnecting || printStatus.isPrinting}
                                className={`p-1.5 rounded-md hover:bg-gray-100 ${
                                  printStatus.isConnecting || printStatus.isPrinting 
                                    ? "text-blue-500 animate-pulse" 
                                    : "text-gray-400 hover:text-gray-900"
                                }`}
                              >
                                {printStatus.isConnecting || printStatus.isPrinting 
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Printer className="w-4 h-4" />
                                }
                              </button>
                            )}
                          </NiimbotLabelPrint>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setProductToEdit(product);
                              setIsModalOpen(true);
                            }} 
                            className="p-1.5 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }} 
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>




      </div>

      <AddProductModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setProductToEdit(null);
        }} 
        onSuccess={() => {
          setProductToEdit(null);
          fetchProducts();
        }}
        productToEdit={productToEdit}
      />
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Printer,
  Loader2,
  Package,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import AddProductModal from "@/components/AddProductModal";
import NiimbotLabelPrint from "@/components/NiimbotLabelPrint";
import { formatBDT, roundMoney } from "@/lib/calculations";

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
  description?: string;
  warranty?: string;
  cost_price?: number;
};

export default function InventoryPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [filterStatus, setFilterStatus] = useState("All");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      await supabase.from("products").delete().eq("id", id);
      fetchProducts();
    }
  };

  const totalProducts = products.length;
  const lowStockItems = products.filter(
    (p) => p.stock > 0 && p.stock <= 5
  ).length;
  const outOfStock = products.filter((p) => p.stock === 0).length;
  const totalValue = roundMoney(
    products.reduce(
      (sum, p) => sum + (Number(p.cost_price) || 0) * (Number(p.stock) || 0),
      0
    )
  );

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q);
      const matchCategory =
        filterCategory === "All Categories" || p.category === filterCategory;
      let matchStatus = true;
      if (filterStatus === "In Stock") matchStatus = p.stock > 5;
      if (filterStatus === "Low Stock")
        matchStatus = p.stock > 0 && p.stock <= 5;
      if (filterStatus === "Out of Stock") matchStatus = p.stock === 0;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [products, search, filterCategory, filterStatus]);

  const categories = [
    "All Categories",
    ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#faf9f6] p-4 sm:p-6 lg:p-8 overflow-y-auto font-sans no-scrollbar">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Products &amp; Inventory
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Manage Rizq footwear catalog, barcodes, and stock levels
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setProductToEdit(null);
            setIsModalOpen(true);
          }}
          className="min-h-[46px] px-5 py-2.5 bg-black text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">
            Total Products
          </p>
          <p className="text-2xl font-black text-gray-900">{totalProducts}</p>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">
            Low Stock
          </p>
          <p className="text-2xl font-black text-amber-600 flex items-center gap-1.5">
            {lowStockItems}
            {lowStockItems > 0 && (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
          </p>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">
            Inventory Cost Value
          </p>
          <p className="text-xl sm:text-2xl font-black text-gray-900 truncate">
            ৳{formatBDT(totalValue)}
          </p>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">
            Out of Stock
          </p>
          <p className="text-2xl font-black text-red-600">{outOfStock}</p>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="h-4 w-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name or barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-[#f3f0ea] text-gray-900 placeholder:text-gray-500 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="min-h-[44px] px-4 py-2 bg-[#f3f0ea] text-gray-900 rounded-xl text-sm font-semibold focus:outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex bg-[#f3f0ea] rounded-xl p-1 overflow-x-auto no-scrollbar">
            {["All", "In Stock", "Low Stock", "Out of Stock"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  filterStatus === status
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Empty / Loading / Responsive Lists */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm font-medium">Loading inventory...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-[#f3f0ea] flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-700" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              No products yet. Add your first product
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mb-5">
              Start building your Rizq shoe inventory with prices, costs, sizes,
              and barcodes.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="min-h-[46px] px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Product</span>
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-14 px-6 text-center text-sm text-gray-400">
            No products match your current search or filters.
          </div>
        ) : (
          <>
            {/* Mobile Card View (< md) */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredProducts.map((product) => {
                const statusBadge =
                  product.stock === 0
                    ? {
                        label: "OUT OF STOCK",
                        cls: "bg-red-600 text-white",
                      }
                    : product.stock <= 5
                    ? {
                        label: "LOW STOCK",
                        cls: "bg-amber-100 text-amber-800",
                      }
                    : {
                        label: "IN STOCK",
                        cls: "bg-emerald-50 text-emerald-800",
                      };

                return (
                  <div
                    key={product.id}
                    onClick={() =>
                      router.push(`/dashboard/products/${product.id}`)
                    }
                    className="p-4 space-y-3 active:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-14 h-14 rounded-xl shrink-0 ${
                          product.image_color || "bg-gray-100"
                        } flex items-center justify-center overflow-hidden border border-gray-100`}
                      >
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-6 h-6 text-gray-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-gray-900 leading-snug">
                            {product.name}
                          </h3>
                          <span className="text-sm font-black text-gray-900 shrink-0">
                            ৳{formatBDT(product.price)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {product.category || "Uncategorized"} • SKU:{" "}
                          {product.barcode || "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge.cls}`}
                          >
                            {statusBadge.label}
                          </span>
                          <span className="text-xs font-semibold text-gray-700">
                            Qty: {product.stock} {product.unit || ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-end gap-2 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <NiimbotLabelPrint
                        productName={product.name}
                        productPrice={product.price}
                        barcodeValue={product.barcode}
                      >
                        {(triggerPrint, printStatus) => (
                          <button
                            type="button"
                            onClick={() => triggerPrint()}
                            disabled={
                              printStatus.isConnecting || printStatus.isPrinting
                            }
                            className="min-h-[44px] px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-1.5 hover:bg-gray-50"
                          >
                            {printStatus.isConnecting ||
                            printStatus.isPrinting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Printer className="w-4 h-4" />
                            )}
                            <span>Label</span>
                          </button>
                        )}
                      </NiimbotLabelPrint>

                      <button
                        type="button"
                        onClick={() => {
                          setProductToEdit(product);
                          setIsModalOpen(true);
                        }}
                        className="min-h-[44px] px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-1.5 hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        aria-label={`Delete ${product.name}`}
                        className="min-w-[44px] min-h-[44px] rounded-xl border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Item</th>
                    <th className="px-5 py-3.5">Product Name</th>
                    <th className="px-5 py-3.5">Barcode</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5 text-right">Price (৳)</th>
                    <th className="px-5 py-3.5 text-right">Stock</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {filteredProducts.map((product) => {
                    let statusText = "IN STOCK";
                    let statusClass =
                      "bg-emerald-50 border-emerald-200 text-emerald-800";
                    if (product.stock === 0) {
                      statusText = "OUT OF STOCK";
                      statusClass = "bg-black text-white border-black";
                    } else if (product.stock <= 5) {
                      statusText = "LOW STOCK";
                      statusClass =
                        "bg-amber-100 text-amber-900 border-amber-200";
                    }

                    return (
                      <tr
                        key={product.id}
                        onClick={() =>
                          router.push(`/dashboard/products/${product.id}`)
                        }
                        className="hover:bg-gray-50/70 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <div
                            className={`w-11 h-11 rounded-xl ${
                              product.image_color || "bg-gray-100"
                            } flex items-center justify-center text-gray-400 border border-gray-100 overflow-hidden`}
                          >
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 opacity-50" />
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-bold text-gray-900">
                          {product.name}
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                          {product.barcode || "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-600">
                          {product.category}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                          ৳{formatBDT(product.price)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right font-bold whitespace-nowrap ${
                            product.stock <= 5
                              ? "text-red-600"
                              : "text-gray-900"
                          }`}
                        >
                          {product.stock}{" "}
                          <span className="text-gray-400 text-xs font-normal">
                            {product.unit || ""}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusClass}`}
                          >
                            {statusText}
                          </span>
                        </td>
                        <td
                          className="px-5 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <NiimbotLabelPrint
                              productName={product.name}
                              productPrice={product.price}
                              barcodeValue={product.barcode}
                            >
                              {(triggerPrint, printStatus) => (
                                <button
                                  type="button"
                                  onClick={() => triggerPrint()}
                                  title="Print Barcode Label"
                                  disabled={
                                    printStatus.isConnecting ||
                                    printStatus.isPrinting
                                  }
                                  className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                                >
                                  {printStatus.isConnecting ||
                                  printStatus.isPrinting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Printer className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </NiimbotLabelPrint>

                            <button
                              type="button"
                              onClick={() => {
                                setProductToEdit(product);
                                setIsModalOpen(true);
                              }}
                              title="Edit Product"
                              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(product.id)}
                              title="Delete Product"
                              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
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

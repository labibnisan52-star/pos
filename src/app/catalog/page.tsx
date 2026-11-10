"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Share2,
  Package,
  Check,
  Phone,
  MessageCircle,
  X,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { formatBDT } from "@/lib/calculations";
import { loadStoreSettings } from "@/components/ReceiptModal";

type ProductVariant = {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  price?: number | null;
  sku?: string | null;
};

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  barcode?: string;
  image_color?: string;
  image_url?: string;
  unit?: string;
  brand?: string;
  description?: string;
  warranty?: string;
};

export default function PublicCatalogPage() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null
  );
  const [copiedLink, setCopiedLink] = useState(false);

  const [storeSettings, setStoreSettings] = useState({
    shopName: "RIZQ",
    shopTagline: "Footwear & Shoes",
    shopPhone: "",
    shopAddress: "",
    logoUrl: "",
  });

  useEffect(() => {
    const s = loadStoreSettings();
    setStoreSettings({
      shopName: s.shopName || "RIZQ",
      shopTagline: s.shopTagline || "Footwear & Shoes",
      shopPhone: s.shopPhone || "",
      shopAddress: s.shopAddress || "",
      logoUrl: s.logoUrl || "",
    });
  }, []);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, varRes] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, price, stock, category, barcode, image_color, image_url, unit, brand, description, warranty"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("product_variants")
          .select("id, product_id, variant_name, variant_value, price, sku")
          .order("created_at", { ascending: true }),
      ]);

      if (prodRes.data) setProducts(prodRes.data as Product[]);
      if (varRes.data) setVariants(varRes.data as ProductVariant[]);
    } catch (err) {
      console.error("Failed to load catalog:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const v of variants) {
      const list = map.get(v.product_id) || [];
      list.push(v);
      map.set(v.product_id, list);
    }
    return map;
  }, [variants]);

  const categories = useMemo(() => {
    return [
      "All",
      ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      const matchCat =
        selectedCategory === "All" || p.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;

      const prodVariants = variantsByProduct.get(p.id) || [];
      const variantMatch = prodVariants.some((v) =>
        v.variant_value.toLowerCase().includes(q)
      );

      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        variantMatch
      );
    });
  }, [products, search, selectedCategory, variantsByProduct]);

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${storeSettings.shopName} — Shoe Catalog`,
          text: `Check out the latest shoes at ${storeSettings.shopName}!`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall back to clipboard
      }
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const getWhatsAppLink = (product: Product, variant?: ProductVariant | null) => {
    const phone = storeSettings.shopPhone.replace(/[^\d+]/g, "");
    const variantText = variant
      ? ` (Size/Option: ${variant.variant_value})`
      : "";
    const message = encodeURIComponent(
      `Hello ${storeSettings.shopName}, I am interested in: "${product.name}"${variantText} - ৳${formatBDT(
        variant?.price && Number(variant.price) > 0
          ? Number(variant.price)
          : product.price
      )}.`
    );
    return phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-gray-900 font-sans flex flex-col">
      {/* Top Banner & Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {storeSettings.logoUrl && (
              <img
                src={storeSettings.logoUrl}
                alt={storeSettings.shopName}
                className="w-10 h-10 object-contain rounded-xl border border-gray-200/80 p-0.5 bg-white shrink-0 shadow-2xs"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">
                  {storeSettings.shopName}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f3f0ea] text-gray-700">
                  Catalog
                </span>
              </div>
              {storeSettings.shopTagline && (
                <p className="text-xs text-gray-500 font-medium">
                  {storeSettings.shopTagline}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[42px] px-3.5 sm:px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-black active:scale-95 transition-all text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>Share Catalog</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="max-w-6xl mx-auto px-4 pb-3 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search shoe name, size, or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-gray-900 text-white shadow-sm"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Product Grid */}
      <main className="max-w-6xl mx-auto px-4 py-6 flex-1 w-full">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <Package className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-500">
              Loading collection...
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-24 text-center max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-[#f3f0ea] flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              No shoes found
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Try a different search word or select &ldquo;All&rdquo; categories.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedCategory("All");
              }}
              className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold"
            >
              Reset Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {filteredProducts.map((product) => {
              const prodVariants = variantsByProduct.get(product.id) || [];
              const inStock = (Number(product.stock) || 0) > 0;

              return (
                <div
                  key={product.id}
                  onClick={() => {
                    setSelectedProduct(product);
                    setSelectedVariant(
                      prodVariants.length > 0 ? prodVariants[0] : null
                    );
                  }}
                  className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden flex flex-col hover:border-gray-900 transition-all cursor-pointer shadow-xs active:scale-[0.99] group"
                >
                  {/* Photo container */}
                  <div className="aspect-square bg-gray-50 relative overflow-hidden flex items-center justify-center">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-300">
                        <Package className="w-12 h-12 stroke-[1.5]" />
                        <span className="text-[10px] font-bold mt-1 uppercase tracking-wider text-gray-400">
                          {storeSettings.shopName}
                        </span>
                      </div>
                    )}

                    {/* Stock pill */}
                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide ${
                          inStock
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {inStock ? "IN STOCK" : "SOLD OUT"}
                      </span>
                    </div>

                    {prodVariants.length > 0 && (
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="bg-white/90 backdrop-blur-xs px-2 py-1 rounded-lg text-[10px] font-bold text-gray-700 text-center truncate shadow-xs">
                          {prodVariants.length} Sizes Available
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
                    <div>
                      {product.brand && (
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                          {product.brand}
                        </p>
                      )}
                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 line-clamp-2 leading-snug group-hover:text-black">
                        {product.name}
                      </h3>
                    </div>

                    <div className="flex items-baseline justify-between pt-1 border-t border-gray-50">
                      <span className="text-base sm:text-lg font-black text-gray-900">
                        ৳{formatBDT(product.price)}
                      </span>
                      <span className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                        <span>Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Product Details Drawer / Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Product Details
              </span>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-5">
              {/* Image Preview */}
              <div className="aspect-4/3 sm:aspect-video bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center border border-gray-100 relative">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Package className="w-16 h-16 text-gray-300" />
                )}
                <div className="absolute top-3 left-3">
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${
                      (Number(selectedProduct.stock) || 0) > 0
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {(Number(selectedProduct.stock) || 0) > 0
                      ? "In Stock"
                      : "Sold Out"}
                  </span>
                </div>
              </div>

              {/* Title & Price */}
              <div>
                {selectedProduct.brand && (
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    {selectedProduct.brand}
                  </p>
                )}
                <h2 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                  {selectedProduct.name}
                </h2>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-gray-900">
                    ৳
                    {formatBDT(
                      selectedVariant?.price && Number(selectedVariant.price) > 0
                        ? Number(selectedVariant.price)
                        : selectedProduct.price
                    )}
                  </span>
                  {selectedProduct.category && (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                      {selectedProduct.category}
                    </span>
                  )}
                </div>
              </div>

              {/* Available Sizes / Variants */}
              {variantsByProduct.get(selectedProduct.id) &&
                (variantsByProduct.get(selectedProduct.id) || []).length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Select Size / Option:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(variantsByProduct.get(selectedProduct.id) || []).map(
                        (v) => {
                          const active = selectedVariant?.id === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelectedVariant(v)}
                              className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all ${
                                active
                                  ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-900"
                              }`}
                            >
                              <span>{v.variant_value}</span>
                              {v.price && Number(v.price) > 0 && (
                                <span className="ml-1.5 opacity-70">
                                  (৳{formatBDT(Number(v.price))})
                                </span>
                              )}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

              {/* Description */}
              {selectedProduct.description && (
                <div className="space-y-1.5 pt-2 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Description
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {selectedProduct.description}
                  </p>
                </div>
              )}

              {/* Warranty */}
              {selectedProduct.warranty && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-semibold text-amber-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Warranty: {selectedProduct.warranty}</span>
                </div>
              )}
            </div>

            {/* Modal Footer (Action Buttons) */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-2.5">
              <a
                href={getWhatsAppLink(selectedProduct, selectedVariant)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[48px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                <span>Inquire on WhatsApp</span>
              </a>

              {storeSettings.shopPhone && (
                <a
                  href={`tel:${storeSettings.shopPhone}`}
                  className="min-h-[48px] py-3 px-5 rounded-xl bg-white border border-gray-200 text-gray-800 hover:bg-gray-100 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call Store</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-1.5">
          <p className="text-sm font-bold text-gray-900">
            {storeSettings.shopName}
          </p>
          {storeSettings.shopAddress && (
            <p className="text-xs text-gray-500">{storeSettings.shopAddress}</p>
          )}
          {storeSettings.shopPhone && (
            <p className="text-xs font-semibold text-gray-700">
              Phone: {storeSettings.shopPhone}
            </p>
          )}
          <div className="pt-2">
            <Link
              href="/"
              className="text-[11px] font-semibold text-gray-400 hover:text-gray-900 inline-flex items-center gap-1"
            >
              <span>Staff Login</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

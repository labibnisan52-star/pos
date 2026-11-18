"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Tag,
  CreditCard,
  Banknote,
  Smartphone,
  ArrowRight,
  Trash2,
  Check,
  Wifi,
  WifiOff,
  ShoppingBag,
  QrCode,
  Camera,
  X,
  Package,
  AlertCircle,
  Loader2,
  UserPlus,
  Layers,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getVisualSearchDB } from "@/lib/visual-search/db";
import { searchCachedProductsOffline } from "@/lib/visual-search/sync";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDataLoadState,
  SlowLoadingNotice,
} from "@/components/ui/data-loader";
import {
  calculateCartTotals,
  calculateLineTotal,
  calculateNewStock,
  CartTotalsResult,
  DiscountType,
  formatBDT,
  parseNumericInput,
  validateDiscountInput,
  validateSaleInput,
} from "@/lib/calculations";
import ReceiptModal, { ReceiptOrderData } from "@/components/ReceiptModal";
import ScanMiniCartSheet from "@/components/pos/ScanMiniCartSheet";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import {
  CHECKOUT_BAR_LABELS,
  STOCK_ERROR_MESSAGES,
} from "@/lib/i18n/scan-cart";
import { validateStock } from "@/lib/stock-validation";
import { Z_INDEX } from "@/lib/z-index";
import PosToastPortal, { type PosToastData } from "@/components/ui/pos-toast";

const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), {
  ssr: false,
});

const VisualSearchModal = dynamic(
  () => import("@/components/visual-search/VisualSearchModal"),
  { ssr: false }
);

interface Product {
  id: string;
  name: string;
  price: number;
  cost_price?: number;
  stock: number;
  category: string;
  image_color?: string;
  image_url?: string;
  barcode?: string;
}

interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  sku?: string | null;
  price?: number | null;
  stock_multiplier?: number | null;
}

interface CustomerOption {
  name: string;
  mobile: string;
}

interface CartItem {
  cartKey: string; // `${productId}::${variantId || 'base'}`
  id: string; // base product id
  variant_id: string | null;
  variant_label: string | null;
  name: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  stockMultiplier: number;
  image_color?: string;
  image_url?: string;
  barcode?: string;
}

interface OfflineQueuedSale {
  localId: string;
  createdAt: string;
  items: Array<{
    id: string;
    variant_id: string | null;
    variant_label: string | null;
    name: string;
    unitPrice: number;
    quantity: number;
  }>;
  discountType: DiscountType;
  discountValue: string;
  amountReceived: string;
  paymentMethod: "Cash" | "Card" | "Mobile";
  customerName: string;
  customerMobile: string;
}

const playBeep = (type: "success" | "error") => {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else {
      osc.frequency.value = 250;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Ignore audio context restriction
  }
};

interface SaleCartPanelProps {
  cart: CartItem[];
  productStockMap: Map<string, number>;
  totals: CartTotalsResult;
  discountType: DiscountType;
  setDiscountType: (type: DiscountType) => void;
  discountInput: string;
  setDiscountInput: (value: string) => void;
  amountReceivedInput: string;
  setAmountReceivedInput: (value: string) => void;
  paymentMethod: "Cash" | "Card" | "Mobile";
  setPaymentMethod: (method: "Cash" | "Card" | "Mobile") => void;
  customerName: string;
  setCustomerName: (value: string) => void;
  customerMobile: string;
  setCustomerMobile: (value: string) => void;
  customerOptions: CustomerOption[];
  onUpdateQuantityDelta: (cartKey: string, delta: number) => void;
  onSetQuantityDirect: (cartKey: string, rawValue: string) => void;
  onRemoveItem: (cartKey: string) => void;
  onClearCart: () => void;
  onCompleteSale: () => void;
  onOpenScanner: () => void;
  onAddMore: () => void;
  lastAddedItem?: { cartKey: string; nonce: number } | null;
  isSubmitting: boolean;
  validationErrors: string[];
  showErrors: boolean;
  isMobileSheet?: boolean;
  onCloseMobileSheet?: () => void;
}

function SaleCartPanel({
  cart,
  productStockMap,
  totals,
  discountType,
  setDiscountType,
  discountInput,
  setDiscountInput,
  amountReceivedInput,
  setAmountReceivedInput,
  paymentMethod,
  setPaymentMethod,
  customerName,
  setCustomerName,
  customerMobile,
  setCustomerMobile,
  customerOptions,
  onUpdateQuantityDelta,
  onSetQuantityDirect,
  onRemoveItem,
  onClearCart,
  onCompleteSale,
  onOpenScanner,
  onAddMore,
  lastAddedItem,
  isSubmitting,
  validationErrors,
  showErrors,
  isMobileSheet = false,
  onCloseMobileSheet,
}: SaleCartPanelProps) {
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [floatingBarHeight, setFloatingBarHeight] = useState(215);
  const [highlightedCartKey, setHighlightedCartKey] = useState<string | null>(
    null
  );
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const floatingBarRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const keyboardHeight = useKeyboardInset();
  const isCompactBar = isMobileSheet && (keyboardHeight > 100 || isAmountFocused);
  const cbLabels = CHECKOUT_BAR_LABELS.en;

  // Measure floating checkout bar height so scrollable content never hides behind it
  useEffect(() => {
    const el = floatingBarRef.current;
    if (!el) return;
    const updateHeight = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setFloatingBarHeight(Math.ceil(h));
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [paymentMethod, cart.length, isCompactBar]);

  // Briefly highlight & scroll newly added/scanned item into view
  useEffect(() => {
    if (!lastAddedItem?.cartKey) return;
    const key = lastAddedItem.cartKey;
    const highlightTimer = setTimeout(() => {
      setHighlightedCartKey(key);
      itemRefs.current[key]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 30);
    const clearTimer = setTimeout(() => {
      setHighlightedCartKey((prev) => (prev === key ? null : prev));
    }, 1250);
    return () => {
      clearTimeout(highlightTimer);
      clearTimeout(clearTimer);
    };
  }, [lastAddedItem]);

  const discountValidation = validateDiscountInput(discountInput);
  const parsedDiscountNum = parseNumericInput(discountInput);
  const isPercentClamped =
    discountType === "percentage" &&
    parsedDiscountNum.isValid &&
    parsedDiscountNum.value > 100;
  const isFixedClamped =
    discountType === "fixed" &&
    parsedDiscountNum.isValid &&
    parsedDiscountNum.value > totals.subtotal &&
    totals.subtotal > 0;

  const matchingCustomers = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return customerOptions.slice(0, 5);
    return customerOptions
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.mobile.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [customerName, customerOptions]);

  // Compute total base-stock used per product across all variants in cart
  const usedBaseStockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(
        item.id,
        (map.get(item.id) || 0) + item.quantity * item.stockMultiplier
      );
    }
    return map;
  }, [cart]);

  const statusBadgeClass =
    totals.paymentStatus === "Paid"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : totals.paymentStatus === "Partial"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-800 border-red-200";

  return (
    <div className="relative flex flex-col h-full w-full bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#f3f0ea] flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 text-gray-800" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Current Sale
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Single-step checkout • No tax
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {cart.length > 0 && (
            <button
              type="button"
              onClick={onClearCart}
              className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
          {isMobileSheet && onCloseMobileSheet && (
            <button
              type="button"
              onClick={onCloseMobileSheet}
              aria-label="Close cart"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Cart + Discount + Payment Method + Customer Body */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 space-y-3.5 bg-[#faf9f6]/60"
        style={{
          paddingBottom:
            floatingBarHeight + (isMobileSheet ? keyboardHeight : 0) + 16,
        }}
      >
        {cart.length === 0 ? (
          <div className="py-10 px-4 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-14 h-14 rounded-full bg-[#f3f0ea] flex items-center justify-center mb-3">
              <ShoppingBag className="w-6 h-6 text-gray-600" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">
              Cart is empty
            </h3>
            <p className="text-xs text-gray-500 max-w-[230px] mb-4">
              Tap a product from the catalog or scan a barcode to start a sale.
            </p>
            <button
              type="button"
              onClick={onOpenScanner}
              className="min-h-[44px] px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-2xs"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan Barcode</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Compact Sticky Action Row: Add More + Scan Barcode */}
            <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-[#faf9f6]/95 backdrop-blur-xs flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onAddMore}
                className="min-h-[44px] h-[42px] px-3.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-900 flex items-center gap-1.5 hover:bg-gray-50 active:scale-[0.98] transition-all shadow-2xs"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add More</span>
              </button>

              <button
                type="button"
                onClick={onOpenScanner}
                aria-label="Scan barcode"
                title="Scan Barcode"
                className="min-w-[44px] min-h-[44px] px-3 bg-white border border-gray-300 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50 active:scale-[0.98] transition-all shadow-2xs"
              >
                <QrCode className="w-4 h-4" />
                <span className="sr-only sm:not-sr-only">Scan</span>
              </button>
            </div>

            {cart.map((item) => {
              const availableBase = productStockMap.get(item.id) ?? 0;
              const usedBase = usedBaseStockMap.get(item.id) ?? 0;
              const overStock = usedBase > availableBase;
              const lineTotal = calculateLineTotal(item.unitPrice, item.quantity);
              const isHighlighted = highlightedCartKey === item.cartKey;

              return (
                <div
                  key={item.cartKey}
                  ref={(el) => {
                    itemRefs.current[item.cartKey] = el;
                  }}
                  className={`bg-white p-3 rounded-2xl border transition-all duration-500 ${
                    overStock
                      ? "border-red-300 bg-red-50/30"
                      : isHighlighted
                      ? "border-emerald-500 ring-2 ring-emerald-400/50 bg-emerald-50/40"
                      : "border-gray-200/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl shrink-0 ${
                          item.image_color || "bg-gray-100"
                        } overflow-hidden flex items-center justify-center`}
                      >
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 leading-snug truncate">
                          {item.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {item.variant_label && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#f3f0ea] text-gray-800 rounded-md">
                              {item.variant_label}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 font-medium">
                            ৳{formatBDT(item.unitPrice)} each
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.cartKey)}
                      aria-label={`Remove ${item.name}`}
                      className="w-11 h-11 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-gray-100">
                    {/* Editable Quantity Controls (44px touch targets) */}
                    <div className="flex items-center bg-[#f3f0ea] rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantityDelta(item.cartKey, -1)}
                        aria-label="Decrease quantity"
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-800 hover:bg-white transition-colors font-bold"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Quantity for ${item.name}`}
                        value={item.quantity === 0 ? "" : String(item.quantity)}
                        onChange={(e) =>
                          onSetQuantityDirect(item.cartKey, e.target.value)
                        }
                        className="w-12 h-11 text-center text-sm font-bold text-gray-900 bg-transparent focus:bg-white rounded-md focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateQuantityDelta(item.cartKey, 1)}
                        aria-label="Increase quantity"
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-800 hover:bg-white transition-colors font-bold"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-base font-extrabold text-gray-900">
                        ৳{formatBDT(lineTotal)}
                      </p>
                      <p
                        className={`text-[10px] font-semibold ${
                          overStock ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        Stock: {availableBase}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Discount Box (% or ৳ toggle — only ONE active at a time) */}
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-gray-500" />
              <span>Discount</span>
            </label>

            <div className="flex bg-[#f3f0ea] p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setDiscountType("fixed")}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold transition-all ${
                  discountType === "fixed"
                    ? "bg-black text-white shadow-2xs"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                ৳ BDT
              </button>
              <button
                type="button"
                onClick={() => setDiscountType("percentage")}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-bold transition-all ${
                  discountType === "percentage"
                    ? "bg-black text-white shadow-2xs"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                % Percent
              </button>
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder={
                discountType === "percentage"
                  ? "Enter discount % (0 - 100)"
                  : "Enter discount amount in ৳"
              }
              className={`w-full min-h-[46px] px-3.5 pr-12 py-2.5 bg-gray-50 border rounded-xl text-sm font-bold text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:bg-white transition-colors ${
                !discountValidation.valid
                  ? "border-red-400 focus:border-red-500"
                  : "border-gray-200 focus:border-gray-900"
              }`}
            />
            <span className="absolute inset-y-0 right-3.5 flex items-center text-xs font-extrabold text-gray-500 pointer-events-none">
              {discountType === "percentage" ? "%" : "৳"}
            </span>
          </div>

          {!discountValidation.valid && discountValidation.error && (
            <p className="text-xs font-semibold text-red-600">
              {discountValidation.error}
            </p>
          )}
          {isPercentClamped && (
            <p className="text-[11px] font-semibold text-amber-700">
              Percentage above 100% is automatically clamped to 100%.
            </p>
          )}
          {isFixedClamped && (
            <p className="text-[11px] font-semibold text-amber-700">
              Discount exceeds subtotal and is capped at ৳
              {formatBDT(totals.subtotal)}.
            </p>
          )}
        </div>

        {/* Payment Method (Amount Received is in the floating bottom bar) */}
        <div className="bg-white p-3.5 rounded-2xl border border-gray-200/80">
          <span className="block text-xs font-bold text-gray-700 mb-2">
            Payment Method
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "Cash", icon: Banknote },
                { id: "Card", icon: CreditCard },
                { id: "Mobile", icon: Smartphone },
              ] as const
            ).map(({ id, icon: Icon }) => {
              const active = paymentMethod === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(id);
                    if (id !== "Cash") {
                      setAmountReceivedInput(
                        totals.grandTotal > 0 ? totals.grandTotal.toFixed(2) : "0"
                      );
                    }
                  }}
                  className={`min-h-[48px] py-2 px-2 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                    active
                      ? "border-black bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-bold">{id}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer Section (Optional unless Due > 0) */}
        <div
          className={`bg-white p-3.5 rounded-2xl border space-y-2.5 ${
            totals.dueAmount > 0 && cart.length > 0 && !customerName.trim()
              ? "border-amber-400 bg-amber-50/20"
              : "border-gray-200/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-gray-500" />
              <span>
                Customer{" "}
                {totals.dueAmount > 0 && cart.length > 0 ? (
                  <span className="text-red-600">(Required for Due)</span>
                ) : (
                  <span className="text-gray-400 font-normal">(Optional)</span>
                )}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 relative">
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() =>
                  setTimeout(() => setShowCustomerDropdown(false), 180)
                }
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name"
                className="w-full min-h-[44px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
              />
              {showCustomerDropdown && matchingCustomers.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {matchingCustomers.map((c, idx) => (
                    <button
                      key={`${c.name}-${idx}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCustomerName(c.name);
                        if (c.mobile) setCustomerMobile(c.mobile);
                        setShowCustomerDropdown(false);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-b-0"
                    >
                      <span className="text-xs font-bold text-gray-900 truncate">
                        {c.name}
                      </span>
                      {c.mobile && (
                        <span className="text-[11px] text-gray-500 ml-2 shrink-0">
                          {c.mobile}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              type="tel"
              inputMode="tel"
              value={customerMobile}
              onChange={(e) => setCustomerMobile(e.target.value)}
              placeholder="Mobile number"
              className="w-full min-h-[44px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-900"
            />
          </div>
        </div>

        {/* Inline Validation Errors */}
        {showErrors && validationErrors.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 space-y-1">
            {validationErrors.map((err, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs font-semibold text-red-700"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permanently Floating Bottom Checkout Bar */}
      <div
        ref={floatingBarRef}
        className="absolute inset-x-0 z-20 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] rounded-t-2xl px-3.5 pt-2.5 space-y-2 transition-all duration-200"
        style={{
          bottom: isMobileSheet ? keyboardHeight : 0,
          paddingBottom:
            isMobileSheet && keyboardHeight > 0
              ? "8px"
              : "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {/* a. Amount Received (Cash only) */}
        {paymentMethod === "Cash" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <label className="text-[11px] font-bold text-gray-700">
                {cbLabels.amountReceived}
              </label>
              {totals.grandTotal > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setAmountReceivedInput(totals.grandTotal.toFixed(2))
                    }
                    className="px-2 py-0.5 rounded-md bg-[#f3f0ea] hover:bg-gray-200 text-[10px] font-bold text-gray-900 transition-colors"
                  >
                    {cbLabels.exact}
                  </button>
                  {[500, 1000].map((note) => (
                    <button
                      key={note}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setAmountReceivedInput(String(note))}
                      className="px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[10px] font-bold text-gray-700 transition-colors"
                    >
                      ৳{note}
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setAmountReceivedInput("0")}
                    className="px-2 py-0.5 rounded-md bg-red-100 hover:bg-red-200 text-[10px] font-bold text-red-900 transition-colors"
                  >
                    {cbLabels.dueZero}
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm font-bold text-gray-500 pointer-events-none">
                ৳
              </span>
              <input
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                value={amountReceivedInput}
                onFocus={() => {
                  setIsAmountFocused(true);
                  setTimeout(() => {
                    floatingBarRef.current?.scrollIntoView({
                      block: "nearest",
                    });
                  }, 150);
                }}
                onBlur={() => setIsAmountFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onChange={(e) => setAmountReceivedInput(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[42px] pl-7 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:bg-white focus:border-gray-900 transition-colors"
              />
            </div>
          </div>
        )}

        {/* b. Summary: Compact single-line when keyboard open, Full card otherwise */}
        {isCompactBar ? (
          <div className="bg-[#faf9f6] px-3 py-1.5 rounded-xl border border-gray-200/80 flex items-center justify-between gap-2 text-[11px] transition-opacity duration-150">
            <span className="font-extrabold text-gray-900 truncate">
              {cbLabels.grandTotal}: ৳{formatBDT(totals.grandTotal)}
            </span>
            <span className="text-gray-300">|</span>
            <span className="font-bold text-emerald-700 truncate">
              {cbLabels.changeShort}: ৳{formatBDT(totals.changeToReturn)}
            </span>
            <span className="text-gray-300">|</span>
            <span
              className={`font-bold truncate ${
                totals.dueAmount > 0 ? "text-amber-700" : "text-gray-600"
              }`}
            >
              {cbLabels.dueShort}: ৳{formatBDT(totals.dueAmount)}
            </span>
          </div>
        ) : (
          <div className="bg-[#faf9f6] px-3 py-2 rounded-xl border border-gray-200/80 space-y-1 transition-opacity duration-150">
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span>{cbLabels.subtotal}</span>
              <span className="font-bold text-gray-900">
                ৳{formatBDT(totals.subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span>
                {cbLabels.discount}
                {totals.discountType === "percentage" && totals.discountValue > 0
                  ? ` (${totals.discountValue}%)`
                  : ""}
              </span>
              <span
                className={`font-bold ${
                  totals.discountAmount > 0 ? "text-emerald-700" : "text-gray-400"
                }`}
              >
                -৳{formatBDT(totals.discountAmount)}
              </span>
            </div>
            <div className="pt-1 border-t border-gray-200 flex items-baseline justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-gray-900">
                {cbLabels.grandTotal}
              </span>
              <span className="text-lg font-black text-gray-900 tracking-tight">
                ৳{formatBDT(totals.grandTotal)}
              </span>
            </div>

            <div className="pt-1 grid grid-cols-2 gap-1.5">
              <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-100">
                <span className="block text-[9px] font-bold uppercase text-emerald-700 leading-tight">
                  {cbLabels.changeToReturn}
                </span>
                <span className="text-xs font-extrabold text-emerald-900">
                  ৳{formatBDT(totals.changeToReturn)}
                </span>
              </div>

              <div
                className={`px-2.5 py-1.5 rounded-lg border ${
                  totals.dueAmount > 0
                    ? "bg-amber-50/80 border-amber-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-bold uppercase text-gray-600 leading-tight">
                    {cbLabels.dueAmount}
                  </span>
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-bold border leading-tight ${statusBadgeClass}`}
                  >
                    {totals.paymentStatus}
                  </span>
                </div>
                <span
                  className={`text-xs font-extrabold ${
                    totals.dueAmount > 0 ? "text-amber-900" : "text-gray-900"
                  }`}
                >
                  ৳{formatBDT(totals.dueAmount)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* c. Complete Sale Button */}
        <button
          type="button"
          onClick={onCompleteSale}
          disabled={cart.length === 0 || isSubmitting}
          className="w-full min-h-[48px] py-3 px-4 bg-black hover:bg-gray-800 active:scale-[0.99] text-white font-extrabold text-sm rounded-xl flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          <span className="flex items-center gap-2">
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{cbLabels.savingSale}</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>{cbLabels.completeSale}</span>
              </>
            )}
          </span>
          <span className="text-base font-black">
            ৳{formatBDT(totals.grandTotal)}
          </span>
        </button>
      </div>
    </div>
  );
}

export default function POSPage() {
  const supabase = useMemo(() => createClient(), []);

  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [offlineMatchedIds, setOfflineMatchedIds] = useState<Set<string> | null>(
    null
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastErrorScanRef = useRef<{ code: string; ts: number } | null>(null);
  const [toast, setToast] = useState<PosToastData | null>(null);
  const [scannerAlert, setScannerAlert] = useState<{ message: string } | null>(
    null
  );

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      const id = Date.now();
      setToast({ id, message, type });
      playBeep(type);
      if (type === "error" && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
      }, 3800);
    },
    []
  );

  const showScannerAlert = useCallback((message: string) => {
    setScannerAlert({ message });
    setTimeout(() => {
      setScannerAlert((prev) => (prev?.message === message ? null : prev));
    }, 3800);
  }, []);

  // Inventory & Variant state
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { showSkeleton, isSlow } = useDataLoadState(loading);

  // Variant picker modal state (for products with sizes/colors/options)
  const [variantPickerProduct, setVariantPickerProduct] =
    useState<Product | null>(null);

  // Single-step Sale State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("fixed");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [amountReceivedInput, setAmountReceivedInput] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<
    "Cash" | "Card" | "Mobile"
  >("Cash");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAddedItem, setLastAddedItem] = useState<{
    cartKey: string;
    nonce: number;
  } | null>(null);
  const [recentCartKeys, setRecentCartKeys] = useState<string[]>([]);

  // Completed Receipt Modal state
  const [completedReceipt, setCompletedReceipt] =
    useState<ReceiptOrderData | null>(null);

  // Mobile sheet & scanner
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanFromCamera, setScanFromCamera] = useState(false);
  const [cameraScanPrompt, setCameraScanPrompt] = useState<{
    status: "added" | "error";
    productName?: string;
    variantLabel?: string | null;
    price?: number;
    message?: string;
  } | null>(null);

  // Connectivity & Offline Queue
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const fetchCatalog = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      let loadedFromLocal = false;
      try {
        const cachedProducts = localStorage.getItem("pos_products_cache");
        const cachedVariants = localStorage.getItem("pos_variants_cache");
        if (cachedProducts) {
          setProducts(JSON.parse(cachedProducts));
          loadedFromLocal = true;
        }
        if (cachedVariants) setVariants(JSON.parse(cachedVariants));
      } catch {
        // Ignore malformed cache
      }
      if (!loadedFromLocal) {
        try {
          const db = getVisualSearchDB();
          const [dexieProducts, dexieVariants] = await Promise.all([
            db.products.toArray(),
            db.variants.toArray(),
          ]);
          if (dexieProducts.length > 0) {
            setProducts(
              dexieProducts.map((p) => ({
                id: p.id,
                name: p.name,
                price: p.price,
                stock: p.stock,
                category: p.category || "General",
                image_url: p.image_url ?? undefined,
                barcode: p.barcode ?? undefined,
              }))
            );
          }
          if (dexieVariants.length > 0) {
            setVariants(
              dexieVariants.map((v) => ({
                id: v.id,
                product_id: v.product_id,
                variant_name: v.variant_name,
                variant_value: v.variant_value,
                sku: v.sku ?? "",
                price: v.price ?? null,
                stock: 0,
                is_active: true,
              }))
            );
          }
        } catch {
          // Ignore Dexie offline fallback errors
        }
      }
      setLoading(false);
      return;
    }

    try {
      const [prodRes, varRes, custRes] = await Promise.all([
        supabase.from("products").select("*").order("name", { ascending: true }),
        supabase.from("product_variants").select("*"),
        supabase
          .from("customers")
          .select("name, mobile")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (!prodRes.error && prodRes.data) {
        setProducts(prodRes.data);
        localStorage.setItem(
          "pos_products_cache",
          JSON.stringify(prodRes.data)
        );
      }

      if (!varRes.error && varRes.data) {
        setVariants(varRes.data);
        localStorage.setItem("pos_variants_cache", JSON.stringify(varRes.data));
      }

      if (!custRes.error && custRes.data) {
        setCustomers(
          custRes.data.map((c) => ({
            name: c.name,
            mobile: c.mobile || "",
          }))
        );
      }
    } catch {
      try {
        const cachedProducts = localStorage.getItem("pos_products_cache");
        const cachedVariants = localStorage.getItem("pos_variants_cache");
        if (cachedProducts) setProducts(JSON.parse(cachedProducts));
        if (cachedVariants) setVariants(JSON.parse(cachedVariants));
      } catch {
        // Ignore
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const syncOfflineOrders = useCallback(async () => {
    setSyncing(true);
    try {
      const queue: OfflineQueuedSale[] = JSON.parse(
        localStorage.getItem("offline_orders") || "[]"
      );
      if (queue.length === 0) return;

      const remaining: OfflineQueuedSale[] = [];
      for (const queued of queue) {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: queued.items.map((it) => ({
              id: it.id,
              variant_id: it.variant_id,
              quantity: it.quantity,
            })),
            discountType: queued.discountType,
            discountValue: queued.discountValue,
            amountReceived: queued.amountReceived,
            paymentMethod: queued.paymentMethod,
            customerName: queued.customerName,
            customerMobile: queued.customerMobile,
          }),
        });

        if (!res.ok) {
          remaining.push(queued);
        }
      }

      localStorage.setItem("offline_orders", JSON.stringify(remaining));
      setOfflineQueueCount(remaining.length);

      if (remaining.length === 0) {
        showToast("Offline sales synced successfully!", "success");
        fetchCatalog();
      } else {
        showToast(
          `${remaining.length} offline sale(s) could not sync yet.`,
          "error"
        );
      }
    } catch {
      showToast("Offline sync failed; will retry when online.", "error");
    } finally {
      setSyncing(false);
    }
  }, [fetchCatalog, showToast]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    fetchCatalog();

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineOrders();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    try {
      const queue = JSON.parse(localStorage.getItem("offline_orders") || "[]");
      setOfflineQueueCount(queue.length);
      if (navigator.onLine && queue.length > 0) {
        syncOfflineOrders();
      }
    } catch {
      // Ignore
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchCatalog, syncOfflineOrders]);

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const v of variants) {
      const list = map.get(v.product_id) || [];
      list.push(v);
      map.set(v.product_id, list);
    }
    return map;
  }, [variants]);

  const productStockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.id, Math.max(0, Number(p.stock) || 0));
    }
    return map;
  }, [products]);

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
    ],
    [products]
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (isOnline || !q) {
      return;
    }
    let cancelled = false;
    searchCachedProductsOffline(q)
      .then((matches) => {
        if (!cancelled) {
          setOfflineMatchedIds(new Set(matches.map((m) => m.id)));
        }
      })
      .catch(() => {
        if (!cancelled) setOfflineMatchedIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOnline, searchQuery]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const effectiveOfflineIds = !isOnline && q ? offlineMatchedIds : null;
    return products.filter((p) => {
      const matchCategory =
        activeCategory === "All" || p.category === activeCategory;
      if (!matchCategory) return false;
      if (!q) return true;

      if (effectiveOfflineIds !== null) {
        return effectiveOfflineIds.has(p.id);
      }

      const prodVariants = variantsByProduct.get(p.id) || [];
      const variantMatch = prodVariants.some(
        (v) =>
          String(v.sku || "")
            .toLowerCase()
            .includes(q) ||
          String(v.variant_value || "")
            .toLowerCase()
            .includes(q)
      );

      return (
        p.name.toLowerCase().includes(q) ||
        String(p.barcode || "")
          .toLowerCase()
          .includes(q) ||
        variantMatch
      );
    });
  }, [
    products,
    activeCategory,
    searchQuery,
    variantsByProduct,
    isOnline,
    offlineMatchedIds,
  ]);

  // Shared calculation & validation via src/lib/calculations.ts
  const totals = useMemo(() => {
    const items = cart.map((item) => ({
      id: item.cartKey,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      costPrice: item.costPrice,
    }));
    const base = calculateCartTotals({
      items,
      discountType,
      discountValue: discountInput,
      amountReceived: amountReceivedInput,
    });
    if (paymentMethod !== "Cash") {
      return calculateCartTotals({
        items,
        discountType,
        discountValue: discountInput,
        amountReceived: String(base.grandTotal),
      });
    }
    return base;
  }, [cart, discountType, discountInput, amountReceivedInput, paymentMethod]);

  const effectiveAmountReceivedRaw =
    paymentMethod !== "Cash" ? String(totals.grandTotal) : amountReceivedInput;

  const saleValidation = useMemo(
    () =>
      validateSaleInput({
        items: cart.map((item) => ({
          id: item.id,
          name: item.variant_label
            ? `${item.name} (${item.variant_label})`
            : item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          availableStock: productStockMap.get(item.id) ?? 0,
          stockMultiplier: item.stockMultiplier,
        })),
        discountType,
        discountRaw: discountInput,
        amountReceivedRaw: effectiveAmountReceivedRaw,
        customerName,
        customerMobile,
      }),
    [
      cart,
      productStockMap,
      discountType,
      discountInput,
      effectiveAmountReceivedRaw,
      customerName,
      customerMobile,
    ]
  );

  const addResolvedItemToCart = useCallback(
    (product: Product, variant: ProductVariant | null): boolean => {
      const availableBase = Math.max(0, Number(product.stock) || 0);
      const mult =
        variant?.stock_multiplier && Number(variant.stock_multiplier) > 0
          ? Number(variant.stock_multiplier)
          : 1;
      const unitPrice =
        variant?.price !== null &&
        variant?.price !== undefined &&
        Number(variant.price) > 0
          ? Number(variant.price)
          : Number(product.price) || 0;
      const variantLabel = variant
        ? variant.variant_name
          ? `${variant.variant_name}: ${variant.variant_value}`
          : variant.variant_value
        : null;
      const cartKey = `${product.id}::${variant ? variant.id : "base"}`;

      const currentUsedBase = cart
        .filter((it) => it.id === product.id)
        .reduce((sum, it) => sum + it.quantity * it.stockMultiplier, 0);
      const existing = cart.find((it) => it.cartKey === cartKey);

      const stockCheck = validateStock({
        productName: product.name,
        availableStock: availableBase,
        currentUsedStock: currentUsedBase,
        additionalUnits: mult,
        qtyInCart: existing ? existing.quantity : currentUsedBase,
        locale: "bn",
      });
      if (!stockCheck.allowed) {
        const msg =
          stockCheck.message || STOCK_ERROR_MESSAGES.bn.insufficientStock;
        showToast(msg, "error");
        return false;
      }

      setLastAddedItem({ cartKey, nonce: Date.now() });
      setRecentCartKeys((keys) => [
        cartKey,
        ...keys.filter((k) => k !== cartKey),
      ]);

      setCart((prev) => {
        const prevExisting = prev.find((it) => it.cartKey === cartKey);
        if (prevExisting) {
          return prev.map((it) =>
            it.cartKey === cartKey ? { ...it, quantity: it.quantity + 1 } : it
          );
        }

        return [
          ...prev,
          {
            cartKey,
            id: product.id,
            variant_id: variant ? variant.id : null,
            variant_label: variantLabel,
            name: product.name,
            unitPrice,
            costPrice: Number(product.cost_price) || 0,
            quantity: 1,
            stockMultiplier: mult,
            image_color: product.image_color,
            image_url: product.image_url,
            barcode: variant?.sku || product.barcode,
          },
        ];
      });
      return true;
    },
    [cart, showToast]
  );

  const handleProductCardTap = useCallback(
    (product: Product) => {
      const check = validateStock({
        productName: product.name,
        availableStock: Number(product.stock) || 0,
        currentUsedStock: 0,
        additionalUnits: 1,
        locale: "bn",
      });
      if (!check.allowed) {
        showToast(
          check.message || STOCK_ERROR_MESSAGES.bn.noStock,
          "error"
        );
        return;
      }
      const prodVariants = variantsByProduct.get(product.id) || [];
      if (prodVariants.length > 0) {
        setVariantPickerProduct(product);
        return;
      }
      addResolvedItemToCart(product, null);
    },
    [variantsByProduct, addResolvedItemToCart, showToast]
  );

  const handleUpdateQuantityDelta = useCallback(
    (cartKey: string, delta: number) => {
      const target = cart.find((it) => it.cartKey === cartKey);
      if (!target) return;
      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        setCart((prev) => prev.filter((it) => it.cartKey !== cartKey));
        return;
      }

      if (delta > 0) {
        const availableBase = productStockMap.get(target.id) ?? 0;
        const totalUsedBase = cart
          .filter((it) => it.id === target.id)
          .reduce((sum, it) => sum + it.quantity * it.stockMultiplier, 0);
        const check = validateStock({
          productName: target.name,
          availableStock: availableBase,
          currentUsedStock: totalUsedBase,
          additionalUnits: delta * target.stockMultiplier,
          qtyInCart: target.quantity,
          locale: "bn",
        });
        if (!check.allowed) {
          showToast(
            check.message || STOCK_ERROR_MESSAGES.bn.insufficientStock,
            "error"
          );
          return;
        }
      }

      setCart((prev) =>
        prev.map((it) =>
          it.cartKey === cartKey ? { ...it, quantity: nextQty } : it
        )
      );
    },
    [cart, productStockMap, showToast]
  );

  const handleSetQuantityDirect = useCallback(
    (cartKey: string, rawValue: string) => {
      const cleaned = rawValue.replace(/[^\d]/g, "");
      const num = cleaned === "" ? 0 : parseInt(cleaned, 10);
      setCart((prev) =>
        prev.map((it) =>
          it.cartKey === cartKey
            ? { ...it, quantity: Number.isFinite(num) ? num : 0 }
            : it
        )
      );
    },
    []
  );

  const handleRemoveItem = useCallback((cartKey: string) => {
    setCart((prev) => prev.filter((it) => it.cartKey !== cartKey));
  }, []);

  const resetSaleForm = useCallback(() => {
    setCart([]);
    setDiscountType("fixed");
    setDiscountInput("");
    setAmountReceivedInput("");
    setPaymentMethod("Cash");
    setCustomerName("");
    setCustomerMobile("");
    setShowErrors(false);
    setMobileCartOpen(false);
  }, []);

  // Barcode / SKU lookup across both products and variants
  const lookupByCode = useCallback(
    (rawCode: string): { product: Product; variant: ProductVariant | null } | null => {
      const clean = rawCode.trim().toLowerCase();
      if (!clean) return null;

      // 1. Exact variant SKU match
      const matchedVariant = variants.find(
        (v) => String(v.sku || "").trim().toLowerCase() === clean
      );
      if (matchedVariant) {
        const parent = products.find((p) => p.id === matchedVariant.product_id);
        if (parent) return { product: parent, variant: matchedVariant };
      }

      // 2. Exact product barcode match (or leading-zero stripped)
      const stripped = clean.replace(/^0+/, "");
      const matchedProduct =
        products.find(
          (p) => String(p.barcode || "").trim().toLowerCase() === clean
        ) ||
        (stripped.length > 0
          ? products.find(
              (p) =>
                String(p.barcode || "")
                  .trim()
                  .toLowerCase()
                  .replace(/^0+/, "") === stripped
            )
          : undefined) ||
        products.find((p) => p.name.trim().toLowerCase() === clean);

      if (matchedProduct) {
        return { product: matchedProduct, variant: null };
      }

      return null;
    },
    [products, variants]
  );

  const processScannedCode = useCallback(
    (code: string, fromCamera = false) => {
      const normalizedCode = code.trim().toLowerCase();
      const triggerScanError = (message: string) => {
        const now = Date.now();
        const last = lastErrorScanRef.current;
        if (
          fromCamera &&
          last &&
          last.code === normalizedCode &&
          now - last.ts < 1500
        ) {
          return;
        }
        lastErrorScanRef.current = { code: normalizedCode, ts: now };
        showToast(message, "error");
        if (fromCamera) {
          showScannerAlert(message);
        }
      };

      const match = lookupByCode(code);
      if (!match) {
        triggerScanError(
          STOCK_ERROR_MESSAGES.bn.productNotFound(code.trim())
        );
        return;
      }

      const availableBase = Math.max(0, Number(match.product.stock) || 0);
      const mult =
        match.variant?.stock_multiplier &&
        Number(match.variant.stock_multiplier) > 0
          ? Number(match.variant.stock_multiplier)
          : 1;
      const currentUsedBase = cart
        .filter((it) => it.id === match.product.id)
        .reduce((sum, it) => sum + it.quantity * it.stockMultiplier, 0);
      const targetCartKey = `${match.product.id}::${
        match.variant ? match.variant.id : "base"
      }`;
      const existingItem = cart.find((it) => it.cartKey === targetCartKey);

      const stockCheck = validateStock({
        productName: match.product.name,
        availableStock: availableBase,
        currentUsedStock: currentUsedBase,
        additionalUnits: match.variant ? mult : 1,
        qtyInCart: existingItem ? existingItem.quantity : currentUsedBase,
        locale: "bn",
      });

      if (!stockCheck.allowed) {
        triggerScanError(
          stockCheck.message || STOCK_ERROR_MESSAGES.bn.noStock
        );
        return;
      }

      if (!match.variant) {
        const prodVariants = variantsByProduct.get(match.product.id) || [];
        if (prodVariants.length > 0) {
          if (fromCamera) {
            setIsScannerOpen(false);
            setScannerAlert(null);
          }
          setScanFromCamera(fromCamera);
          setVariantPickerProduct(match.product);
          setSearchQuery("");
          return;
        }
      }

      const unitPrice =
        match.variant?.price !== null &&
        match.variant?.price !== undefined &&
        Number(match.variant.price) > 0
          ? Number(match.variant.price)
          : Number(match.product.price) || 0;
      const variantLabel = match.variant
        ? match.variant.variant_name
          ? `${match.variant.variant_name}: ${match.variant.variant_value}`
          : match.variant.variant_value
        : null;

      const added = addResolvedItemToCart(match.product, match.variant);
      if (!added) return;

      if (fromCamera) {
        setIsScannerOpen(false);
        setScannerAlert(null);
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(30);
      }
      setSearchQuery("");

      if (fromCamera) {
        playBeep("success");
        setCameraScanPrompt({
          status: "added",
          productName: match.product.name,
          variantLabel,
          price: unitPrice,
        });
      } else {
        showToast(`Added "${match.product.name}"`, "success");
      }
    },
    [
      cart,
      lookupByCode,
      variantsByProduct,
      addResolvedItemToCart,
      showToast,
      showScannerAlert,
    ]
  );

  const handleCameraScan = useCallback(
    (code: string) => {
      processScannedCode(code, true);
    },
    [processScannedCode]
  );

  // Hardware USB/Bluetooth barcode scanner listener
  useEffect(() => {
    let buffer = "";
    let lastTime = Date.now();

    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      if (now - lastTime > 150) {
        buffer = "";
      }
      lastTime = now;

      if (e.key === "Enter" && buffer.trim().length >= 2) {
        const code = buffer.trim();
        buffer = "";
        e.preventDefault();
        processScannedCode(code);
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [processScannedCode]);

  const handleCompleteSale = async () => {
    if (isSubmitting) return;
    setShowErrors(true);

    if (!saleValidation.valid) {
      playBeep("error");
      return;
    }

    setIsSubmitting(true);
    try {
      // Offline mode queue
      if (!isOnline) {
        const localId = `offline-${Date.now()}`;
        const createdAt = new Date().toISOString();
        const queuedEntry: OfflineQueuedSale = {
          localId,
          createdAt,
          items: cart.map((it) => ({
            id: it.id,
            variant_id: it.variant_id,
            variant_label: it.variant_label,
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
          })),
          discountType,
          discountValue: discountInput,
          amountReceived: amountReceivedInput,
          paymentMethod,
          customerName: customerName.trim() || "Walk-in Customer",
          customerMobile: customerMobile.trim(),
        };

        const queue: OfflineQueuedSale[] = JSON.parse(
          localStorage.getItem("offline_orders") || "[]"
        );
        queue.push(queuedEntry);
        localStorage.setItem("offline_orders", JSON.stringify(queue));
        setOfflineQueueCount(queue.length);

        // Deduct local cached stock
        const updatedProducts = products.map((p) => {
          const used = cart
            .filter((it) => it.id === p.id)
            .reduce((s, it) => s + it.quantity * it.stockMultiplier, 0);
          return used > 0 ? { ...p, stock: Math.max(0, p.stock - used) } : p;
        });
        setProducts(updatedProducts);
        localStorage.setItem(
          "pos_products_cache",
          JSON.stringify(updatedProducts)
        );

        const offlineReceipt: ReceiptOrderData = {
          id: localId,
          created_at: createdAt,
          customer_name: customerName.trim() || "Walk-in Customer",
          customer_mobile: customerMobile.trim(),
          payment_method: paymentMethod,
          subtotal: totals.subtotal,
          discount_type: totals.discountType,
          discount_value: totals.discountValue,
          discount_amount: totals.discountAmount,
          grand_total: totals.grandTotal,
          amount_received: totals.amountReceived,
          paid_amount: totals.paidAmount,
          change: totals.changeToReturn,
          due_amount: totals.dueAmount,
          payment_status: totals.paymentStatus,
          items: cart.map((it, idx) => ({
            name: it.name,
            variant_label: it.variant_label,
            quantity: totals.items[idx].quantity,
            unit_price: totals.items[idx].unitPrice,
            line_total: totals.items[idx].lineTotal,
          })),
          isOfflineQueued: true,
        };

        resetSaleForm();
        setCompletedReceipt(offlineReceipt);
        showToast("Sale saved offline!", "success");
        return;
      }

      // Online atomic server transaction via /api/sales
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((it) => ({
            id: it.id,
            variant_id: it.variant_id,
            quantity: it.quantity,
          })),
          discountType,
          discountValue: discountInput,
          amountReceived: amountReceivedInput,
          paymentMethod,
          customerName: customerName.trim(),
          customerMobile: customerMobile.trim(),
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        showToast(payload?.error || "Could not complete sale.", "error");
        return;
      }

      // Reset screen immediately for the next customer & display receipt modal
      resetSaleForm();
      setCompletedReceipt(payload.order as ReceiptOrderData);
      showToast("Sale completed!", "success");
      fetchCatalog();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Network error while saving sale.";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 h-full min-h-0 overflow-hidden relative bg-[#faf9f6]">
      {/* Top-level Portal Toast Notification (always unblurred & above all overlays) */}
      <PosToastPortal toast={toast} onDismiss={() => setToast(null)} />

      {/* Left / Main Catalog Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Search & Status Header */}
        <div className="p-3 sm:p-4 pb-2 flex items-center gap-2.5 bg-white md:bg-transparent border-b md:border-b-0 border-gray-100 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  const direct = lookupByCode(searchQuery);
                  if (direct) {
                    processScannedCode(searchQuery);
                  } else if (filteredProducts.length === 1) {
                    handleProductCardTap(filteredProducts[0]);
                    setSearchQuery("");
                  } else {
                    showToast(
                      `No exact barcode match for "${searchQuery.trim()}".`,
                      "error"
                    );
                  }
                }
              }}
              placeholder="Search product name, variant, SKU, or barcode..."
              className="w-full min-h-[46px] pl-10 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="w-9 h-9 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsVisualSearchOpen(true)}
            aria-label="Visual product search with camera"
            title="Visual Product Search"
            className="relative min-w-[46px] min-h-[46px] bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center text-emerald-800 hover:bg-emerald-100 shadow-2xs shrink-0 transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-[9px] font-black text-white leading-none shadow-xs">
              NEW
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            aria-label="Scan barcode with camera"
            className="min-w-[46px] min-h-[46px] bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-800 hover:bg-gray-50 shadow-2xs shrink-0"
          >
            <QrCode className="w-5 h-5" />
          </button>

          <div
            className={`hidden sm:flex items-center px-3 min-h-[40px] rounded-full text-xs font-bold border shrink-0 ${
              isOnline
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 mr-1.5" />
            )}
            {isOnline
              ? syncing
                ? "Syncing..."
                : "Online"
              : `Offline (${offlineQueueCount})`}
          </div>
        </div>

        {/* Category Filter Pills */}
        {products.length > 0 && (
          <div className="px-3 sm:px-4 py-2 overflow-x-auto shrink-0">
            <div className="flex items-center gap-2">
              {categories.map((cat) => {
                const count =
                  cat === "All"
                    ? products.length
                    : products.filter((p) => p.category === cat).length;
                const active = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`min-h-[44px] px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-colors ${
                      active
                        ? "bg-gray-900 text-white"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Product Grid / Empty States */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 pt-1 pb-28 md:pb-4">
          {showSkeleton && products.length === 0 ? (
            <div className="space-y-3">
              {isSlow && <SlowLoadingNotice onRetry={fetchCatalog} />}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-3 rounded-2xl border border-gray-100 space-y-2.5"
                  >
                    <Skeleton className="aspect-square w-full rounded-xl" />
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-14 rounded-md" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="h-full min-h-[280px] bg-white rounded-3xl border border-dashed border-gray-200 p-8 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#f3f0ea] flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-gray-700" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                No products yet. Add your first product
              </h2>
              <p className="text-sm text-gray-500 max-w-sm mb-5">
                Your Rizq product catalog is empty. Add products with variants, colors,
                and barcodes to start selling.
              </p>
              <Link
                href="/dashboard/products"
                className="min-h-[46px] px-5 py-2.5 bg-black text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Go to Products</span>
              </Link>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="min-h-[220px] bg-white rounded-2xl border border-gray-200 p-8 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-bold text-gray-900 mb-1">
                No matching products found
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Try clearing your search or switching category filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("All");
                }}
                className="min-h-[44px] px-4 py-2 bg-[#f3f0ea] rounded-xl text-xs font-bold text-gray-900"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const prodVariants = variantsByProduct.get(product.id) || [];
                const outOfStock = (Number(product.stock) || 0) <= 0;
                const inCartQty = cart
                  .filter((it) => it.id === product.id)
                  .reduce((s, it) => s + it.quantity, 0);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleProductCardTap(product)}
                    disabled={outOfStock}
                    className={`text-left bg-white p-3 rounded-2xl border transition-all flex flex-col relative ${
                      outOfStock
                        ? "opacity-55 cursor-not-allowed border-gray-200"
                        : "border-gray-200/80 hover:border-gray-900 hover:shadow-md active:scale-[0.98]"
                    }`}
                  >
                    <div
                      className={`w-full aspect-4/3 rounded-xl mb-2.5 relative ${
                        product.image_color || "bg-gray-100"
                      } overflow-hidden flex items-center justify-center`}
                    >
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-7 h-7 text-gray-400" />
                      )}

                      <span
                        className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold z-10 ${
                          outOfStock
                            ? "bg-red-600 text-white"
                            : product.stock <= 5
                            ? "bg-amber-500 text-white"
                            : "bg-white/95 text-gray-800"
                        }`}
                      >
                        {outOfStock
                          ? "Out of stock"
                          : product.stock <= 5
                          ? `Low: ${product.stock}`
                          : `${product.stock} in stock`}
                      </span>

                      {inCartQty > 0 && (
                        <span className="absolute top-2 left-2 min-w-[24px] h-6 px-1.5 rounded-full bg-black text-white text-xs font-extrabold flex items-center justify-center z-10">
                          {inCartQty}
                        </span>
                      )}

                      {prodVariants.length > 0 && (
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-semibold flex items-center gap-1 z-10">
                          <Layers className="w-3 h-3" />
                          {prodVariants.length} sizes/variants
                        </span>
                      )}
                    </div>

                    <p className="text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                      ৳{formatBDT(product.price)}
                    </p>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mt-0.5 line-clamp-2 leading-snug">
                      {product.name}
                    </h3>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tablet & Desktop Right Single-Step Cart + Payment Panel */}
      <div className="hidden md:flex md:w-[370px] lg:w-[410px] xl:w-[440px] border-l border-gray-200 shrink-0 h-full">
        <SaleCartPanel
          cart={cart}
          productStockMap={productStockMap}
          totals={totals}
          discountType={discountType}
          setDiscountType={setDiscountType}
          discountInput={discountInput}
          setDiscountInput={setDiscountInput}
          amountReceivedInput={amountReceivedInput}
          setAmountReceivedInput={setAmountReceivedInput}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerMobile={customerMobile}
          setCustomerMobile={setCustomerMobile}
          customerOptions={customers}
          onUpdateQuantityDelta={handleUpdateQuantityDelta}
          onSetQuantityDirect={handleSetQuantityDirect}
          onRemoveItem={handleRemoveItem}
          onClearCart={resetSaleForm}
          onCompleteSale={handleCompleteSale}
          onOpenScanner={() => setIsScannerOpen(true)}
          onAddMore={() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }}
          lastAddedItem={lastAddedItem}
          isSubmitting={isSubmitting}
          validationErrors={saleValidation.errors}
          showErrors={showErrors}
        />
      </div>

      {/* Mobile Sticky Bottom Bar (Item count + Grand Total + "View Cart") */}
      {!mobileCartOpen && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 p-3 bg-white/95 backdrop-blur-xs border-t border-gray-200">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="w-full min-h-[54px] px-4 py-2.5 bg-gray-900 text-white rounded-2xl shadow-lg flex items-center justify-between active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4 text-white" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs text-gray-300 font-semibold leading-tight">
                  {totals.itemCount} {totals.itemCount === 1 ? "item" : "items"}
                </p>
                <p className="text-base font-black text-white leading-tight truncate">
                  ৳{formatBDT(totals.grandTotal)}
                </p>
              </div>
            </div>

            <span className="px-3.5 py-2 rounded-xl bg-white text-gray-900 text-xs font-extrabold flex items-center gap-1.5 shrink-0">
              <span>View Cart</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>
      )}

      {/* Mobile Full-Height Bottom Sheet */}
      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white h-dvh">
          <SaleCartPanel
            cart={cart}
            productStockMap={productStockMap}
            totals={totals}
            discountType={discountType}
            setDiscountType={setDiscountType}
            discountInput={discountInput}
            setDiscountInput={setDiscountInput}
            amountReceivedInput={amountReceivedInput}
            setAmountReceivedInput={setAmountReceivedInput}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerMobile={customerMobile}
            setCustomerMobile={setCustomerMobile}
            customerOptions={customers}
            onUpdateQuantityDelta={handleUpdateQuantityDelta}
            onSetQuantityDirect={handleSetQuantityDirect}
            onRemoveItem={handleRemoveItem}
            onClearCart={resetSaleForm}
            onCompleteSale={handleCompleteSale}
            onOpenScanner={() => {
              setMobileCartOpen(false);
              setIsScannerOpen(true);
            }}
            onAddMore={() => {
              setMobileCartOpen(false);
              setTimeout(() => {
                searchInputRef.current?.focus();
              }, 60);
            }}
            lastAddedItem={lastAddedItem}
            isSubmitting={isSubmitting}
            validationErrors={saleValidation.errors}
            showErrors={showErrors}
            isMobileSheet
            onCloseMobileSheet={() => setMobileCartOpen(false)}
          />
        </div>
      )}

      {/* Product Variant Picker Modal */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Select Size / Variant
                </h3>
                <p className="text-xs text-gray-500">
                  {variantPickerProduct.name} • Stock:{" "}
                  {variantPickerProduct.stock}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVariantPickerProduct(null);
                  setScanFromCamera(false);
                }}
                aria-label="Close variant selector"
                className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2">
              {(variantsByProduct.get(variantPickerProduct.id) || []).map(
                (v) => {
                  const vPrice =
                    v.price !== null &&
                    v.price !== undefined &&
                    Number(v.price) > 0
                      ? Number(v.price)
                      : Number(variantPickerProduct.price) || 0;
                  const label = v.variant_name
                    ? `${v.variant_name}: ${v.variant_value}`
                    : v.variant_value;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        const prodName = variantPickerProduct.name;
                        const added = addResolvedItemToCart(variantPickerProduct, v);
                        if (!added) return;
                        setVariantPickerProduct(null);
                        if (scanFromCamera) {
                          setScanFromCamera(false);
                          playBeep("success");
                          if (typeof navigator !== "undefined" && navigator.vibrate) {
                            navigator.vibrate(30);
                          }
                          setCameraScanPrompt({
                            status: "added",
                            productName: prodName,
                            variantLabel: label,
                            price: vPrice,
                          });
                        }
                      }}
                      className="w-full min-h-[52px] px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-900 hover:bg-gray-50 flex items-center justify-between transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900">
                          {label}
                        </p>
                        {v.sku && (
                          <p className="text-[11px] text-gray-500 font-mono">
                            SKU: {v.sku}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-extrabold text-gray-900">
                        ৳{formatBDT(vPrice)}
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post-Camera-Scan Mini Cart Bottom Sheet */}
      {cameraScanPrompt && (
        <ScanMiniCartSheet
          prompt={cameraScanPrompt}
          cart={cart}
          recentCartKeys={recentCartKeys}
          lastAddedItem={lastAddedItem}
          productStockMap={productStockMap}
          itemCount={totals.itemCount}
          grandTotal={totals.grandTotal}
          onUpdateQuantityDelta={handleUpdateQuantityDelta}
          onRemoveItem={handleRemoveItem}
          onClose={() => setCameraScanPrompt(null)}
          onScanMore={() => {
            setCameraScanPrompt(null);
            setIsScannerOpen(true);
          }}
          onGoToCheckout={() => {
            setCameraScanPrompt(null);
            setIsScannerOpen(false);
            if (typeof window !== "undefined" && window.innerWidth < 768) {
              setMobileCartOpen(true);
            }
          }}
        />
      )}

      {/* Camera Barcode Scanner */}
      {isScannerOpen && (
        <BarcodeScanner
          onScan={handleCameraScan}
          inlineAlert={scannerAlert}
          onDismissAlert={() => setScannerAlert(null)}
          onClose={() => {
            setIsScannerOpen(false);
            setScannerAlert(null);
          }}
        />
      )}

      {/* Visual Product Search Modal */}
      {isVisualSearchOpen && (
        <VisualSearchModal
          isOpen={isVisualSearchOpen}
          isOnline={isOnline}
          products={products}
          variants={variants}
          cart={cart}
          onClose={() => setIsVisualSearchOpen(false)}
          onAddMatchToCart={(productId, variantId) => {
            const product = products.find((p) => p.id === productId);
            if (!product) return;
            const variant = variantId
              ? (variants.find((v) => v.id === variantId) ?? null)
              : null;
            addResolvedItemToCart(product, variant);
          }}
          onUpdateCartDelta={handleUpdateQuantityDelta}
          onFallbackSearchManually={() => {
            setIsVisualSearchOpen(false);
            setTimeout(() => {
              searchInputRef.current?.focus();
            }, 50);
          }}
          onFallbackScanBarcode={() => {
            setIsVisualSearchOpen(false);
            setIsScannerOpen(true);
          }}
        />
      )}

      {/* Thermal Receipt Modal */}
      <ReceiptModal
        order={completedReceipt}
        onClose={() => setCompletedReceipt(null)}
        title="Sale Completed"
        primaryActionLabel="Next Sale"
      />
    </div>
  );
}

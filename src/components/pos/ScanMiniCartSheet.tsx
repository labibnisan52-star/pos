"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Minus,
  Package,
  Plus,
  QrCode,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { calculateLineTotal, formatBDT } from "@/lib/calculations";
import { SCAN_MINI_CART_LABELS } from "@/lib/i18n/scan-cart";
import { validateStock } from "@/lib/stock-validation";
import { Z_INDEX } from "@/lib/z-index";

export interface ScanMiniCartItem {
  cartKey: string;
  id: string;
  variant_label: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  stockMultiplier: number;
  image_color?: string;
  image_url?: string;
}

export interface CameraScanPromptState {
  status: "added" | "error";
  productName?: string;
  variantLabel?: string | null;
  price?: number;
  message?: string;
}

interface ScanMiniCartSheetProps {
  prompt: CameraScanPromptState;
  cart: ScanMiniCartItem[];
  recentCartKeys: string[];
  lastAddedItem: { cartKey: string; nonce: number } | null;
  productStockMap: Map<string, number>;
  itemCount: number;
  grandTotal: number;
  onUpdateQuantityDelta: (cartKey: string, delta: number) => void;
  onRemoveItem: (cartKey: string) => void;
  onClose: () => void;
  onScanMore: () => void;
  onGoToCheckout: () => void;
}

export default function ScanMiniCartSheet({
  prompt,
  cart,
  recentCartKeys,
  lastAddedItem,
  productStockMap,
  itemCount,
  grandTotal,
  onUpdateQuantityDelta,
  onRemoveItem,
  onClose,
  onScanMore,
  onGoToCheckout,
}: ScanMiniCartSheetProps) {
  const t = SCAN_MINI_CART_LABELS.bn;
  const tEn = SCAN_MINI_CART_LABELS.en;
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // Order items with most recently scanned/added at the top
  const orderedCart = useMemo(() => {
    const rank = new Map<string, number>();
    recentCartKeys.forEach((k, idx) => rank.set(k, idx));
    return [...cart].sort((a, b) => {
      const ra = rank.has(a.cartKey) ? (rank.get(a.cartKey) as number) : 9999;
      const rb = rank.has(b.cartKey) ? (rank.get(b.cartKey) as number) : 9999;
      return ra - rb;
    });
  }, [cart, recentCartKeys]);

  // Highlight newly added/incremented row for ~2s and scroll it into view
  useEffect(() => {
    if (!lastAddedItem?.cartKey) return;
    const key = lastAddedItem.cartKey;
    const startTimer = setTimeout(() => {
      setHighlightedKey(key);
      rowRefs.current[key]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 30);
    const fadeTimer = setTimeout(() => {
      setHighlightedKey((prev) => (prev === key ? null : prev));
    }, 2000);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(fadeTimer);
    };
  }, [lastAddedItem]);

  const handleIncrement = (item: ScanMiniCartItem) => {
    const availableBase = productStockMap.get(item.id) ?? 0;
    const usedBase = usedBaseStockMap.get(item.id) ?? 0;
    const check = validateStock({
      productName: item.name,
      availableStock: availableBase,
      currentUsedStock: usedBase,
      additionalUnits: item.stockMultiplier,
      qtyInCart: item.quantity,
      locale: "bn",
    });
    if (!check.allowed) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      setStockWarning({
        key: item.cartKey,
        message: check.message || t.stockLimitReached,
      });
      setTimeout(() => {
        setStockWarning((prev) =>
          prev?.key === item.cartKey ? null : prev
        );
      }, 3500);
      return;
    }
    setStockWarning(null);
    onUpdateQuantityDelta(item.cartKey, 1);
  };

  const handleRemove = (cartKey: string) => {
    const remainingCount = cart.length - 1;
    onRemoveItem(cartKey);
    if (remainingCount <= 0) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      style={{ zIndex: Z_INDEX.scanMiniCart }}
    >
      <div className="bg-white w-full sm:max-w-md max-h-[88dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* a. Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                prompt.status === "added"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {prompt.status === "added" ? (
                <Check className="w-6 h-6 stroke-[2.5]" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                {prompt.status === "added" ? t.addedToCart : t.scanNotice}
              </p>
              {prompt.status === "added" ? (
                <>
                  <h3 className="text-base font-extrabold text-gray-900 truncate">
                    {prompt.productName}
                  </h3>
                  <p className="text-xs font-semibold text-gray-500">
                    {prompt.variantLabel ? `${prompt.variantLabel} • ` : ""}
                    ৳{formatBDT(prompt.price || 0)}
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold text-red-600">
                  {prompt.message}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tEn.close}
            className="min-w-[44px] min-h-[44px] -mr-1 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* b. Scrollable Mini Cart List (max ~38dvh) */}
        {orderedCart.length > 0 && (
          <div className="max-h-[38dvh] overflow-y-auto px-4 py-2.5 space-y-2 bg-[#faf9f6]/70">
            {orderedCart.map((item) => {
              const lineTotal = calculateLineTotal(item.unitPrice, item.quantity);
              const isHighlighted = highlightedKey === item.cartKey;
              const inlineWarning =
                stockWarning?.key === item.cartKey ? stockWarning.message : null;

              return (
                <div
                  key={item.cartKey}
                  ref={(el) => {
                    rowRefs.current[item.cartKey] = el;
                  }}
                  className={`p-2.5 rounded-2xl border transition-colors duration-700 ${
                    isHighlighted
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-white border-gray-200/80"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* 40px thumbnail */}
                    <div
                      className={`w-10 h-10 rounded-xl shrink-0 ${
                        item.image_color || "bg-gray-100"
                      } overflow-hidden flex items-center justify-center border border-gray-100`}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-4 h-4 text-gray-400" />
                      )}
                    </div>

                    {/* Name & Unit Price */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-extrabold text-gray-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] font-medium text-gray-500 truncate">
                        {item.variant_label ? `${item.variant_label} • ` : ""}
                        ৳{formatBDT(item.unitPrice)}
                      </p>
                    </div>

                    {/* Line Total */}
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-gray-900">
                        ৳{formatBDT(lineTotal)}
                      </p>
                    </div>
                  </div>

                  {/* Stepper (44px touch targets) + Remove */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-gray-100">
                    <div className="flex items-center bg-[#f3f0ea] rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (item.quantity <= 1) {
                            handleRemove(item.cartKey);
                          } else {
                            onUpdateQuantityDelta(item.cartKey, -1);
                          }
                        }}
                        aria-label={tEn.decreaseQty}
                        className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-gray-800 hover:bg-white transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="min-w-[32px] text-center text-xs font-extrabold text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIncrement(item)}
                        aria-label={tEn.increaseQty}
                        className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-gray-800 hover:bg-white transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {inlineWarning && (
                      <span
                        className="text-[11px] font-bold text-red-600 leading-tight"
                        style={{
                          fontFamily:
                            "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
                        }}
                      >
                        {inlineWarning}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemove(item.cartKey)}
                      aria-label={`${tEn.remove} ${item.name}`}
                      className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* c + d + e. Sticky Footer: Summary Pill + Bengali Question + Pinned হ্যাঁ / না */}
        <div
          className="shrink-0 border-t border-gray-100 bg-white px-5 pt-3 space-y-3"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          <div className="p-3.5 rounded-2xl bg-[#f3f0ea] flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">
              {t.cartLabel} ({itemCount}{" "}
              {itemCount === 1 ? t.itemSingular : t.itemPlural})
            </span>
            <span className="text-base font-black text-gray-900">
              ৳{formatBDT(grandTotal)}
            </span>
          </div>

          <div
            className="space-y-2.5"
            style={{
              fontFamily:
                "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
            }}
          >
            <p className="text-base font-extrabold text-gray-900 text-center leading-snug">
              {t.askAddMore}
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onScanMore}
                className="w-full min-h-[52px] py-3 px-4 bg-black hover:bg-gray-800 active:scale-[0.98] text-white rounded-2xl text-base font-extrabold flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <QrCode className="w-5 h-5" />
                <span>{t.yes}</span>
              </button>

              <button
                type="button"
                onClick={onGoToCheckout}
                className="w-full min-h-[52px] py-3 px-4 bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-gray-900 rounded-2xl text-base font-extrabold flex items-center justify-center gap-2 transition-all"
              >
                <ShoppingBag className="w-5 h-5" />
                <span>{t.no}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


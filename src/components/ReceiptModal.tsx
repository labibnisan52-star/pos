"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Printer, X, Plus } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import {
  calculateLineTotal,
  DiscountType,
  formatBDT,
  PaymentStatus,
} from "@/lib/calculations";

export interface ReceiptItemData {
  name: string;
  variant_label?: string | null;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

export interface ReceiptOrderData {
  id: string;
  created_at: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  payment_method: string;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  grand_total: number;
  amount_received: number;
  paid_amount: number;
  change: number;
  due_amount: number;
  payment_status: PaymentStatus;
  items: ReceiptItemData[];
  isOfflineQueued?: boolean;
}

export interface StorePrintSettings {
  shopName: string;
  shopTagline: string;
  shopAddress: string;
  shopPhone: string;
  receiptFooter: string;
  paperWidth: "80mm" | "58mm";
  logoUrl?: string;
  showLogoOnReceipt?: boolean;
  logoFilter?: "grayscale" | "original";
  logoSize?: "sm" | "md" | "lg";
}

const DEFAULT_SETTINGS: StorePrintSettings = {
  shopName: "RIZQ",
  shopTagline: "Footwear & Shoes",
  shopAddress: "",
  shopPhone: "",
  receiptFooter: "Thank you for shopping at Rizq!",
  paperWidth: "80mm",
  logoUrl: "",
  showLogoOnReceipt: true,
  logoFilter: "grayscale",
  logoSize: "md",
};

export function loadStoreSettings(): StorePrintSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem("rizq_store_settings");
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      shopName: parsed.shopName || DEFAULT_SETTINGS.shopName,
      shopTagline: parsed.shopTagline ?? DEFAULT_SETTINGS.shopTagline,
      shopAddress: parsed.shopAddress || "",
      shopPhone: parsed.shopPhone || "",
      receiptFooter: parsed.receiptFooter || DEFAULT_SETTINGS.receiptFooter,
      paperWidth: parsed.paperWidth === "58mm" ? "58mm" : "80mm",
      logoUrl: parsed.logoUrl || "",
      showLogoOnReceipt: parsed.showLogoOnReceipt !== false,
      logoFilter: parsed.logoFilter === "original" ? "original" : "grayscale",
      logoSize: parsed.logoSize || "md",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface ReceiptModalProps {
  order: ReceiptOrderData | null;
  onClose: () => void;
  title?: string;
  primaryActionLabel?: string;
}

export default function ReceiptModal({
  order,
  onClose,
  title = "Sale Completed",
  primaryActionLabel = "Next Sale",
}: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<StorePrintSettings>(DEFAULT_SETTINGS);
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");

  useEffect(() => {
    if (order) {
      const loaded = loadStoreSettings();
      setSettings(loaded);
      setPaperWidth(loaded.paperWidth);
    }
  }, [order]);

  const shortOrderNo = order
    ? "#" + order.id.replace(/^offline-/, "OFF-").replace(/-/g, "").slice(0, 8).toUpperCase()
    : "";

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Rizq-Receipt-${shortOrderNo}`,
    pageStyle: `
      @page {
        size: ${paperWidth} auto;
        margin: 0mm;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${paperWidth} !important;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .thermal-receipt-sheet {
          width: ${paperWidth === "58mm" ? "54mm" : "74mm"} !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 2.5mm 2mm 6mm 2mm !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          font-size: ${paperWidth === "58mm" ? "10px" : "11.5px"} !important;
        }
        .thermal-receipt-logo {
          display: block !important;
          margin: 0 auto 2mm auto !important;
          max-width: ${paperWidth === "58mm" ? (settings.logoSize === "sm" ? "30mm" : settings.logoSize === "lg" ? "46mm" : "38mm") : (settings.logoSize === "sm" ? "40mm" : settings.logoSize === "lg" ? "60mm" : "50mm")} !important;
          max-height: ${paperWidth === "58mm" ? "22mm" : "28mm"} !important;
          height: auto !important;
          object-fit: contain !important;
          filter: ${settings.logoFilter === "grayscale" ? "grayscale(100%) contrast(160%)" : "none"} !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `,
  });

  if (!order) return null;

  const formattedDate = new Date(order.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formattedTime = new Date(order.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusColor =
    order.payment_status === "Paid"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : order.payment_status === "Partial"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-800 border-red-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[94dvh] flex flex-col overflow-hidden border border-gray-100">
        {/* Modal Header */}
        <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-[#faf9f6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                {title}
              </h2>
              {order.isOfflineQueued && (
                <p className="text-[11px] font-medium text-amber-700">
                  Saved offline — will sync automatically
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Paper size toggle */}
            <div className="flex bg-gray-200/80 p-0.5 rounded-lg text-xs font-bold">
              {(["58mm", "80mm"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setPaperWidth(w)}
                  className={`px-2 py-1 rounded-md transition-colors min-h-[32px] ${
                    paperWidth === w
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-200/60 hover:text-gray-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100/70 flex justify-center">
          <div
            ref={receiptRef}
            className={`thermal-receipt-sheet bg-white text-black font-mono rounded-xl border border-gray-200 shadow-xs p-4 sm:p-5 h-fit ${
              paperWidth === "58mm" ? "w-[260px] text-[11px]" : "w-full max-w-[330px] text-xs"
            }`}
          >
            {/* Shop Header */}
            <div className="text-center border-b border-dashed border-gray-400 pb-3 mb-3">
              {settings.showLogoOnReceipt && settings.logoUrl && (
                <div className="flex justify-center mb-2">
                  <img
                    src={settings.logoUrl}
                    alt={settings.shopName}
                    className={`thermal-receipt-logo mx-auto object-contain ${
                      settings.logoFilter === "grayscale"
                        ? "grayscale contrast-125"
                        : ""
                    } ${
                      paperWidth === "58mm"
                        ? settings.logoSize === "sm"
                          ? "max-w-[100px] max-h-[42px]"
                          : settings.logoSize === "lg"
                          ? "max-w-[155px] max-h-[60px]"
                          : "max-w-[125px] max-h-[50px]"
                        : settings.logoSize === "sm"
                        ? "max-w-[130px] max-h-[50px]"
                        : settings.logoSize === "lg"
                        ? "max-w-[195px] max-h-[75px]"
                        : "max-w-[160px] max-h-[62px]"
                    }`}
                  />
                </div>
              )}
              <h3 className="text-xl font-black tracking-wider uppercase text-black">
                {settings.shopName}
              </h3>
              {settings.shopTagline && (
                <p className="text-[11px] text-gray-700 font-sans font-medium">
                  {settings.shopTagline}
                </p>
              )}
              {settings.shopAddress && (
                <p className="text-[11px] text-gray-700 mt-0.5">
                  {settings.shopAddress}
                </p>
              )}
              {settings.shopPhone && (
                <p className="text-[11px] text-gray-700">Tel: {settings.shopPhone}</p>
              )}
            </div>

            {/* Order Meta */}
            <div className="space-y-1 border-b border-dashed border-gray-400 pb-2.5 mb-2.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Receipt:</span>
                <span className="font-bold text-black">{shortOrderNo}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Date:</span>
                <span className="text-black">
                  {formattedDate} {formattedTime}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Customer:</span>
                <span className="font-semibold text-black text-right truncate">
                  {order.customer_name && order.customer_name !== "Guest"
                    ? order.customer_name
                    : "Walk-in"}
                </span>
              </div>
              {order.customer_mobile && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-600">Phone:</span>
                  <span className="text-black">{order.customer_mobile}</span>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="border-b border-dashed border-gray-400 pb-2.5 mb-2.5 space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase text-gray-600 border-b border-dotted border-gray-300 pb-1">
                <span>Item</span>
                <span>Total (৳)</span>
              </div>
              {order.items.map((item, idx) => {
                const lineTotal =
                  item.line_total !== undefined
                    ? item.line_total
                    : calculateLineTotal(item.unit_price, item.quantity);
                return (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-black leading-snug break-words">
                        {item.name}
                        {item.variant_label ? ` (${item.variant_label})` : ""}
                      </span>
                      <span className="font-bold text-black whitespace-nowrap">
                        ৳{formatBDT(lineTotal)}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-600">
                      {item.quantity} × ৳{formatBDT(item.unit_price)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals (NO TAX LINE — tax is always 0 in Rizq POS) */}
            <div className="space-y-1.5 border-b border-dashed border-gray-400 pb-2.5 mb-2.5">
              <div className="flex justify-between">
                <span className="text-gray-700">Subtotal</span>
                <span className="font-semibold text-black">
                  ৳{formatBDT(order.subtotal)}
                </span>
              </div>

              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">
                    Discount
                    {order.discount_type === "percentage" &&
                    order.discount_value > 0
                      ? ` (${order.discount_value}%)`
                      : ""}
                  </span>
                  <span className="font-semibold text-black">
                    -৳{formatBDT(order.discount_amount)}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-1.5 border-t border-gray-300 text-sm font-black">
                <span className="text-black uppercase">Grand Total</span>
                <span className="text-base text-black">
                  ৳{formatBDT(order.grand_total)}
                </span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="space-y-1 border-b border-dashed border-gray-400 pb-2.5 mb-3 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-700">Payment Method</span>
                <span className="font-semibold text-black">
                  {order.payment_method}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Amount Received</span>
                <span className="text-black">
                  ৳{formatBDT(order.amount_received)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Paid Amount</span>
                <span className="font-semibold text-black">
                  ৳{formatBDT(order.paid_amount)}
                </span>
              </div>
              {order.change > 0 && (
                <div className="flex justify-between font-bold">
                  <span className="text-black">Change Returned</span>
                  <span className="text-black">৳{formatBDT(order.change)}</span>
                </div>
              )}
              {order.due_amount > 0 && (
                <div className="flex justify-between font-bold">
                  <span className="text-black">Due Amount</span>
                  <span className="text-black">
                    ৳{formatBDT(order.due_amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1">
                <span className="text-gray-700">Status</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border font-sans ${statusColor}`}
                >
                  {order.payment_status}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-gray-600 font-sans">
              <p className="font-semibold text-gray-800">
                {settings.receiptFooter}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions (44px+ touch targets) */}
        <div className="p-4 border-t border-gray-100 bg-white flex gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handlePrint()}
            className="flex-1 min-h-[48px] py-3 px-4 bg-[#f3f0ea] text-gray-900 font-bold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] py-3 px-4 bg-black text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{primaryActionLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}


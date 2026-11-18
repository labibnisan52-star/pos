"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, X } from "lucide-react";
import { Z_INDEX } from "@/lib/z-index";
import { useTranslation } from "@/lib/i18n";

export interface PosToastData {
  id: number;
  message: string;
  type: "success" | "error";
}

interface PosToastPortalProps {
  toast: PosToastData | null;
  onDismiss: () => void;
}

/**
 * Top-level portal toast rendered directly into document.body above all overlays
 * (scanner, bottom sheet backdrop, modals) with no blur/filter so text stays sharp.
 */
export default function PosToastPortal({
  toast,
  onDismiss,
}: PosToastPortalProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mounted || !toast) return null;

  return createPortal(
    <div
      role="alert"
      aria-live="assertive"
      style={{
        zIndex: Z_INDEX.toast,
        top: "max(12px, env(safe-area-inset-top))",
        fontFamily:
          "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
      }}
      className="fixed inset-x-0 flex justify-center px-3 pointer-events-none"
    >
      <div
        className={`pointer-events-auto w-full max-w-md px-4 py-3 rounded-2xl shadow-2xl flex items-start gap-3 border ${
          toast.type === "success"
            ? "bg-gray-900 text-white border-gray-800"
            : "bg-red-600 text-white border-red-500"
        }`}
      >
        <div className="w-7 h-7 rounded-xl bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
          {toast.type === "success" ? (
            <Check className="w-4 h-4 stroke-[2.5]" />
          ) : (
            <AlertCircle className="w-4 h-4 stroke-[2.5]" />
          )}
        </div>
        <p className="flex-1 text-sm font-bold leading-snug break-words">
          {toast.message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("stock.dismiss")}
          className="min-w-[36px] min-h-[36px] -mr-1 -my-1 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}


"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, RefreshCw, X } from "lucide-react";
import { formatBDT } from "@/lib/calculations";
import { useTranslation } from "@/lib/i18n";
import type { PendingSaleRecord } from "@/lib/offline/db";
import {
  getPendingAndFailedSales,
  retryAllFailedSales,
  retryFailedSale,
  subscribeOfflineSync,
  syncPendingSales,
} from "@/lib/offline/sync";
import { Z_INDEX } from "@/lib/z-index";

interface PendingSalesSheetProps {
  isOpen: boolean;
  isOnline: boolean;
  onClose: () => void;
}

export default function PendingSalesSheet({
  isOpen,
  isOnline,
  onClose,
}: PendingSalesSheetProps) {
  const { t } = useTranslation();
  const [sales, setSales] = useState<PendingSaleRecord[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const load = () => {
      void getPendingAndFailedSales().then(setSales);
    };
    load();
    const unsub = subscribeOfflineSync(load);
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const failedSales = sales.filter((s) => s.status === "failed");
  const pendingSales = sales.filter(
    (s) => s.status === "pending" || s.status === "syncing"
  );

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      style={{
        zIndex: Z_INDEX.scanMiniCart,
        fontFamily:
          "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md max-h-[85dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-gray-900">
              {t("offline.pendingSalesTitle")}
            </h3>
            <p className="text-xs text-gray-500">
              {pendingSales.length} {t("offline.statusPending")} •{" "}
              {failedSales.length} {t("offline.statusFailed")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("scanSheet.close")}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#faf9f6]/70">
          {sales.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-sm font-bold text-gray-700">
                {t("offline.noPendingSales")}
              </p>
            </div>
          ) : (
            <>
              {/* Failed / Sync Issues */}
              {failedSales.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      <span>
                        {t("offline.syncIssuesTitle")} ({failedSales.length})
                      </span>
                    </h4>
                    {isOnline && (
                      <button
                        type="button"
                        onClick={() => void retryAllFailedSales()}
                        className="text-xs font-bold text-red-700 hover:underline"
                      >
                        {t("offline.retryAll")}
                      </button>
                    )}
                  </div>

                  {failedSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="bg-white p-3.5 rounded-2xl border border-red-200 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-gray-900 truncate">
                            {sale.items.map((it) => `${it.name} ×${it.quantity}`).join(", ")}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {new Date(sale.createdAt).toLocaleTimeString()} •{" "}
                            {sale.paymentMethod}
                          </p>
                        </div>
                        <span className="text-sm font-black text-gray-900 shrink-0">
                          ৳{formatBDT(sale.grandTotal)}
                        </span>
                      </div>

                      {sale.lastError && (
                        <p className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-xl">
                          {sale.lastError}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={!isOnline || retryingId === sale.id}
                        onClick={async () => {
                          setRetryingId(sale.id);
                          await retryFailedSale(sale.id);
                          setRetryingId(null);
                        }}
                        className="w-full min-h-[42px] rounded-xl bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gray-800 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            retryingId === sale.id ? "animate-spin" : ""
                          }`}
                        />
                        <span>{t("offline.retry")}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Sales */}
              {pendingSales.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-amber-800 flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>
                        {t("offline.statusPending")} ({pendingSales.length})
                      </span>
                    </h4>
                    {isOnline && (
                      <button
                        type="button"
                        onClick={() =>
                          void syncPendingSales({ ignoreBackoff: true })
                        }
                        className="text-xs font-bold text-gray-800 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{t("offline.retry")}</span>
                      </button>
                    )}
                  </div>

                  {pendingSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="bg-white p-3.5 rounded-2xl border border-amber-200 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-gray-900 truncate">
                          {sale.items.map((it) => `${it.name} ×${it.quantity}`).join(", ")}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {new Date(sale.createdAt).toLocaleTimeString()} •{" "}
                          {sale.paymentMethod}
                        </p>
                      </div>
                      <span className="text-sm font-black text-gray-900 shrink-0">
                        ৳{formatBDT(sale.grandTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

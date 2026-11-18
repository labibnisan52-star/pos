"use client";

import React from "react";
import Link from "next/link";
import { WifiOff, Store } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function OfflineFallbackPage() {
  const { t } = useTranslation();

  return (
    <div
      className="min-h-dvh bg-[#faf9f6] flex items-center justify-center p-6"
      style={{
        fontFamily:
          "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
      }}
    >
      <div className="bg-white max-w-sm w-full rounded-3xl border border-gray-200 shadow-lg p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
          <WifiOff className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-extrabold text-gray-900">
          {t("offline.offlinePageTitle")}
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          {t("offline.offlinePageDesc")}
        </p>
        <Link
          href="/dashboard/pos"
          className="w-full min-h-[48px] bg-black text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-800 active:scale-95 transition-all"
        >
          <Store className="w-4 h-4" />
          <span>{t("offline.goToPos")}</span>
        </Link>
      </div>
    </div>
  );
}

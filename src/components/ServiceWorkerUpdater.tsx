"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Z_INDEX } from "@/lib/z-index";

/**
 * Checks for a waiting Service Worker and shows a Bengali update prompt
 * ("নতুন ভার্সন আছে, আপডেট করুন") instead of silently disrupting an active sale.
 */
export default function ServiceWorkerUpdater() {
  const { t } = useTranslation();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    let reloading = false;
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    const inspectRegistration = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(reg.waiting || installing);
            }
          });
        });
        await reg.update().catch(() => {});
      } catch {
        // Ignore SW inspection errors
      }
    };

    void inspectRegistration();

    const handleFocus = () => {
      void inspectRegistration();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      style={{
        zIndex: Z_INDEX.toast - 1,
        bottom: "max(16px, env(safe-area-inset-bottom))",
        fontFamily:
          "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
      }}
      className="fixed left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-gray-800 flex items-center gap-3 max-w-[92vw]"
    >
      <span className="text-xs font-bold">{t("offline.newVersionAvailable")}</span>
      <button
        type="button"
        onClick={() => {
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
        }}
        className="min-h-[34px] px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-extrabold flex items-center gap-1.5 shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{t("offline.updateNow")}</span>
      </button>
    </div>
  );
}

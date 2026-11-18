"use client";

import React, { useEffect, useRef, useState } from "react";
import { WifiOff, RefreshCw, Clock } from "lucide-react";

export function useDataLoadState(
  rawLoading: boolean,
  options?: { minDisplayMs?: number; slowThresholdMs?: number }
) {
  const minDisplayMs = options?.minDisplayMs ?? 250;
  const slowThresholdMs = options?.slowThresholdMs ?? 8000;

  const [minElapsed, setMinElapsed] = useState(!rawLoading);
  const [isSlow, setIsSlow] = useState(false);
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const loadStartRef = useRef<number | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (rawLoading) {
      loadStartRef.current = Date.now();
      const tMin = setTimeout(() => setMinElapsed(true), minDisplayMs);
      const tSlow = setTimeout(() => setIsSlow(true), slowThresholdMs);
      return () => {
        clearTimeout(tMin);
        clearTimeout(tSlow);
      };
    }

    const resetTimer = setTimeout(() => {
      setIsSlow(false);
    }, 0);

    const startedAt = loadStartRef.current;
    if (startedAt === null) {
      const doneTimer = setTimeout(() => setMinElapsed(true), 0);
      return () => {
        clearTimeout(resetTimer);
        clearTimeout(doneTimer);
      };
    }

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, minDisplayMs - elapsed);
    const tDone = setTimeout(() => {
      setMinElapsed(true);
      loadStartRef.current = null;
    }, remaining);

    return () => {
      clearTimeout(resetTimer);
      clearTimeout(tDone);
    };
  }, [rawLoading, minDisplayMs, slowThresholdMs]);

  const showSkeleton = rawLoading || !minElapsed;

  return { showSkeleton, isSlow: rawLoading && isSlow, isOffline };
}

export function OfflineStatusBanner({
  message = "You are currently offline. Showing cached data where available.",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2.5 text-xs font-semibold shrink-0"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
      <span>{message}</span>
    </div>
  );
}

export function SlowLoadingNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
        <span>Taking longer than usual...</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-black text-white text-xs font-bold flex items-center gap-1.5 hover:bg-gray-800 active:scale-95 transition-all shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

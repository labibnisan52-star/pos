"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOfflineSyncSummary,
  subscribeOfflineSync,
  syncPendingSales,
} from "@/lib/offline/sync";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshSyncState = useCallback(async () => {
    const summary = await getOfflineSyncSummary();
    setPendingCount(summary.pendingCount);
    setFailedCount(summary.failedCount);
    setIsSyncing(summary.isSyncing);
    setLastSyncedAt(summary.lastSyncedAt);
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      void refreshSyncState();
    }, 0);

    const unsubscribe = subscribeOfflineSync(() => {
      void refreshSyncState();
    });

    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingSales({ ignoreBackoff: true }).then(() =>
        refreshSyncState()
      );
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic retry while app is open & online
    const interval = setInterval(() => {
      if (navigator.onLine) {
        void syncPendingSales().then(() => refreshSyncState());
      }
    }, 20_000);

    return () => {
      clearTimeout(initTimer);
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [refreshSyncState]);

  return {
    isOnline,
    pendingCount,
    failedCount,
    isSyncing,
    lastSyncedAt,
    refreshSyncState,
  };
}


"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/utils/supabase/client";
import { syncVisualSearchCatalog } from "@/lib/visual-search/sync";

/**
 * Keeps Dexie IndexedDB mirrored with Supabase products, variants, and
 * embeddings on app load and whenever network connectivity returns.
 */
export default function VisualSearchSyncBoot() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const runSync = (forceReconcile = false) => {
      if (!navigator.onLine) return;
      syncVisualSearchCatalog(supabase, { forceReconcile }).catch((err) => {
        console.warn("Visual search catalog sync skipped:", err);
      });
    };

    runSync(false);

    const handleOnline = () => runSync(true);
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user, supabase]);

  return null;
}


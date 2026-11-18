"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decrementLocalProductStock,
  getOfflineDB,
  getOfflineMeta,
  setOfflineMeta,
  type OfflineProductRecord,
  type OfflineVariantRecord,
  type PendingSaleRecord,
} from "./db";

const BACKOFF_MS = [5_000, 15_000, 60_000] as const;

type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

export function subscribeOfflineSync(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifyOfflineSyncListeners() {
  syncListeners.forEach((fn) => fn());
}

export interface OfflineSyncSummary {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncedAt: string | null;
}

let isSyncRunning = false;

export async function getOfflineSyncSummary(): Promise<OfflineSyncSummary> {
  try {
    const db = getOfflineDB();
    const [pendingCount, failedCount, lastSyncedAt] = await Promise.all([
      db.pending_sales.where("status").anyOf(["pending", "syncing"]).count(),
      db.pending_sales.where("status").equals("failed").count(),
      getOfflineMeta<string>("lastSyncedAt"),
    ]);
    return {
      pendingCount,
      failedCount,
      isSyncing: isSyncRunning,
      lastSyncedAt,
    };
  } catch {
    return {
      pendingCount: 0,
      failedCount: 0,
      isSyncing: isSyncRunning,
      lastSyncedAt: null,
    };
  }
}

export async function getPendingAndFailedSales(): Promise<PendingSaleRecord[]> {
  try {
    const all = await getOfflineDB()
      .pending_sales.where("status")
      .anyOf(["pending", "syncing", "failed"])
      .toArray();
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function syncCatalogToIndexedDB(
  supabase: SupabaseClient
): Promise<{
  products: OfflineProductRecord[];
  variants: OfflineVariantRecord[];
  customers: Array<{ name: string; mobile: string }>;
  lastSyncedAt: string;
} | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null;
  }

  const [prodRes, varRes, custRes] = await Promise.all([
    supabase.from("products").select("*").order("name", { ascending: true }),
    supabase.from("product_variants").select("*"),
    supabase
      .from("customers")
      .select("name, mobile")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (prodRes.error) {
    throw prodRes.error;
  }

  const db = getOfflineDB();
  const products: OfflineProductRecord[] = (prodRes.data || []).map((p) => ({
    id: String(p.id),
    name: String(p.name || ""),
    price: Number(p.price) || 0,
    cost_price: Number(p.cost_price) || 0,
    stock: Number(p.stock) || 0,
    category: String(p.category || "General"),
    image_color: p.image_color || undefined,
    image_url: p.image_url || undefined,
    barcode: p.barcode || undefined,
    unit: p.unit || undefined,
  }));

  const variants: OfflineVariantRecord[] = (varRes.data || []).map((v) => ({
    id: String(v.id),
    product_id: String(v.product_id),
    variant_name: String(v.variant_name || ""),
    variant_value: String(v.variant_value || ""),
    sku: String(v.sku || ""),
    price: v.price !== null && v.price !== undefined ? Number(v.price) : null,
    stock_multiplier: v.stock_multiplier ? Number(v.stock_multiplier) : 1,
    stock: Number(v.stock) || 0,
    is_active: v.is_active !== false,
  }));

  const customers = (custRes.data || []).map((c) => ({
    name: String(c.name || ""),
    mobile: String(c.mobile || ""),
  }));

  const lastSyncedAt = new Date().toISOString();

  await db.transaction("rw", db.products, db.variants, db.meta, async () => {
    await db.products.clear();
    if (products.length > 0) await db.products.bulkPut(products);

    if (!varRes.error) {
      await db.variants.clear();
      if (variants.length > 0) await db.variants.bulkPut(variants);
    }

    await db.meta.put({ key: "lastSyncedAt", value: lastSyncedAt });
    await db.meta.put({ key: "customers", value: customers });
  });

  // Also keep legacy localStorage cache fresh
  try {
    localStorage.setItem("pos_products_cache", JSON.stringify(products));
    localStorage.setItem("pos_variants_cache", JSON.stringify(variants));
  } catch {
    // Ignore storage quota
  }

  notifyOfflineSyncListeners();
  return { products, variants, customers, lastSyncedAt };
}

export async function readOfflineCatalog(): Promise<{
  products: OfflineProductRecord[];
  variants: OfflineVariantRecord[];
  customers: Array<{ name: string; mobile: string }>;
  lastSyncedAt: string | null;
}> {
  const db = getOfflineDB();
  const [products, variants, customers, lastSyncedAt] = await Promise.all([
    db.products.toArray(),
    db.variants.toArray(),
    getOfflineMeta<Array<{ name: string; mobile: string }>>("customers"),
    getOfflineMeta<string>("lastSyncedAt"),
  ]);
  return {
    products,
    variants,
    customers: customers || [],
    lastSyncedAt,
  };
}

export async function queueOfflineSale(
  sale: Omit<
    PendingSaleRecord,
    "id" | "status" | "retryCount" | "nextRetryAt" | "lastError"
  > & { id?: string }
): Promise<PendingSaleRecord> {
  const id =
    sale.id ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const record: PendingSaleRecord = {
    ...sale,
    id,
    status: "pending",
    retryCount: 0,
    nextRetryAt: 0,
    lastError: null,
  };

  await getOfflineDB().pending_sales.put(record);
  await decrementLocalProductStock(
    record.items.map((it) => ({
      id: it.id,
      quantity: it.quantity,
      stockMultiplier: it.stockMultiplier,
    }))
  );

  // Request Background Sync if supported
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        const syncReg = reg as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        return syncReg.sync?.register("sync-pending-sales");
      })
      .catch(() => {});
  }

  notifyOfflineSyncListeners();
  return record;
}

export async function syncPendingSales(options?: {
  ignoreBackoff?: boolean;
}): Promise<{ synced: number; failed: number; remaining: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const summary = await getOfflineSyncSummary();
    return {
      synced: 0,
      failed: summary.failedCount,
      remaining: summary.pendingCount,
    };
  }

  if (isSyncRunning) {
    const summary = await getOfflineSyncSummary();
    return {
      synced: 0,
      failed: summary.failedCount,
      remaining: summary.pendingCount,
    };
  }

  isSyncRunning = true;
  notifyOfflineSyncListeners();

  let synced = 0;
  let failed = 0;

  try {
    const db = getOfflineDB();
    const pendingList = (
      await db.pending_sales
        .where("status")
        .anyOf(["pending", "syncing"])
        .toArray()
    ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const now = Date.now();
    for (const sale of pendingList) {
      if (
        !options?.ignoreBackoff &&
        sale.nextRetryAt > 0 &&
        now < sale.nextRetryAt
      ) {
        continue;
      }

      await db.pending_sales.update(sale.id, { status: "syncing" });
      notifyOfflineSyncListeners();

      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": sale.id,
          },
          body: JSON.stringify({
            clientSaleId: sale.id,
            items: sale.items.map((it) => ({
              id: it.id,
              variant_id: it.variant_id,
              quantity: it.quantity,
            })),
            discountType: sale.discountType,
            discountValue: sale.discountValue,
            amountReceived: sale.amountReceived,
            paymentMethod: sale.paymentMethod,
            customerName: sale.customerName,
            customerMobile: sale.customerMobile,
          }),
        });

        if (res.ok) {
          await db.pending_sales.update(sale.id, {
            status: "synced",
            lastError: null,
          });
          synced += 1;
        } else if (res.status >= 400 && res.status < 500) {
          // Server explicitly rejected (e.g. stock conflict) -> mark failed so cashier can review/retry
          let errText = `Server rejected (${res.status})`;
          try {
            const payload = await res.json();
            if (payload?.error) errText = String(payload.error);
          } catch {
            // Ignore JSON parse error
          }
          await db.pending_sales.update(sale.id, {
            status: "failed",
            lastError: errText,
          });
          failed += 1;
        } else {
          // 5xx -> keep pending with exponential backoff
          const nextRetryCount = sale.retryCount + 1;
          const delay =
            BACKOFF_MS[Math.min(nextRetryCount - 1, BACKOFF_MS.length - 1)];
          await db.pending_sales.update(sale.id, {
            status: "pending",
            retryCount: nextRetryCount,
            nextRetryAt: Date.now() + delay,
            lastError: `HTTP ${res.status}`,
          });
        }
      } catch (err: unknown) {
        // Network failure -> keep pending with backoff
        const nextRetryCount = sale.retryCount + 1;
        const delay =
          BACKOFF_MS[Math.min(nextRetryCount - 1, BACKOFF_MS.length - 1)];
        await db.pending_sales.update(sale.id, {
          status: "pending",
          retryCount: nextRetryCount,
          nextRetryAt: Date.now() + delay,
          lastError: err instanceof Error ? err.message : "Network error",
        });
      }
    }
  } finally {
    isSyncRunning = false;
    notifyOfflineSyncListeners();
  }

  const summary = await getOfflineSyncSummary();
  return { synced, failed, remaining: summary.pendingCount };
}

export async function retryFailedSale(id: string): Promise<void> {
  await getOfflineDB().pending_sales.update(id, {
    status: "pending",
    retryCount: 0,
    nextRetryAt: 0,
    lastError: null,
  });
  notifyOfflineSyncListeners();
  await syncPendingSales({ ignoreBackoff: true });
}

export async function retryAllFailedSales(): Promise<void> {
  const db = getOfflineDB();
  const failed = await db.pending_sales
    .where("status")
    .equals("failed")
    .toArray();
  for (const s of failed) {
    await db.pending_sales.update(s.id, {
      status: "pending",
      retryCount: 0,
      nextRetryAt: 0,
      lastError: null,
    });
  }
  notifyOfflineSyncListeners();
  await syncPendingSales({ ignoreBackoff: true });
}

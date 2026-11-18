"use client";

import Dexie, { type Table } from "dexie";
import type { DiscountType } from "@/lib/calculations";

export interface OfflineProductRecord {
  id: string;
  name: string;
  price: number;
  cost_price?: number;
  stock: number;
  category: string;
  image_color?: string;
  image_url?: string;
  barcode?: string;
  unit?: string;
}

export interface OfflineVariantRecord {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  sku: string;
  price: number | null;
  stock_multiplier?: number;
  stock?: number;
  is_active?: boolean;
}

export interface OfflineMetaRecord {
  key: string;
  value: unknown;
}

export interface PendingSaleItem {
  id: string;
  variant_id: string | null;
  variant_label: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  stockMultiplier?: number;
}

export type PendingSaleStatus = "pending" | "syncing" | "failed" | "synced";

export interface PendingSaleRecord {
  id: string; // Client-generated UUID (also used as idempotency key)
  createdAt: string;
  items: PendingSaleItem[];
  discountType: DiscountType;
  discountValue: string;
  amountReceived: string;
  paymentMethod: "Cash" | "Card" | "Mobile";
  customerName: string;
  customerMobile: string;
  subtotal: number;
  discountAmount: number;
  grandTotal: number;
  changeToReturn: number;
  dueAmount: number;
  paymentStatus: "Paid" | "Partial" | "Unpaid";
  status: PendingSaleStatus;
  retryCount: number;
  nextRetryAt: number;
  lastError?: string | null;
}

class OfflinePosDatabase extends Dexie {
  products!: Table<OfflineProductRecord, string>;
  variants!: Table<OfflineVariantRecord, string>;
  meta!: Table<OfflineMetaRecord, string>;
  pending_sales!: Table<PendingSaleRecord, string>;

  constructor() {
    super("rizq_pos_offline");
    this.version(1).stores({
      products: "id, name, category, barcode",
      variants: "id, product_id, sku",
      meta: "key",
      pending_sales: "id, status, createdAt, nextRetryAt",
    });
  }
}

let dbInstance: OfflinePosDatabase | null = null;

export function getOfflineDB(): OfflinePosDatabase {
  if (!dbInstance) {
    dbInstance = new OfflinePosDatabase();
  }
  return dbInstance;
}

export async function getOfflineMeta<T>(key: string): Promise<T | null> {
  try {
    const row = await getOfflineDB().meta.get(key);
    return row ? (row.value as T) : null;
  } catch {
    return null;
  }
}

export async function setOfflineMeta<T>(key: string, value: T): Promise<void> {
  try {
    await getOfflineDB().meta.put({ key, value });
  } catch {
    // Ignore IndexedDB quota/private mode errors
  }
}

/**
 * Immediately decrement local product stock in IndexedDB after an offline sale
 * so subsequent offline scans/sales cannot oversell.
 */
export async function decrementLocalProductStock(
  items: Array<{ id: string; quantity: number; stockMultiplier?: number }>
): Promise<void> {
  const db = getOfflineDB();
  await db.transaction("rw", db.products, async () => {
    for (const item of items) {
      const existing = await db.products.get(item.id);
      if (!existing) continue;
      const mult =
        item.stockMultiplier && item.stockMultiplier > 0
          ? item.stockMultiplier
          : 1;
      const nextStock = Math.max(
        0,
        (Number(existing.stock) || 0) - Number(item.quantity || 0) * mult
      );
      await db.products.update(item.id, { stock: nextStock });
    }
  });
}


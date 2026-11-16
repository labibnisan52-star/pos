import type { SupabaseClient } from "@supabase/supabase-js";
import Fuse from "fuse.js";
import {
  getVisualSearchDB,
  type CachedEmbedding,
  type CachedProduct,
} from "./db";
import type { MatchableVariant } from "./similarity";

const PAGE_SIZE = 200;
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

export interface SyncSummary {
  productsCount: number;
  variantsCount: number;
  embeddingsSynced: number;
  embeddingsRemoved: number;
}

async function fetchAllPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/**
 * Mirrors products, variants, and product_embeddings from Supabase to Dexie
 * in 200-row pages using `updated_at` as an incremental cursor, and
 * reconciles deleted embedding IDs periodically.
 */
export async function syncVisualSearchCatalog(
  supabase: SupabaseClient,
  options?: { forceReconcile?: boolean }
): Promise<SyncSummary> {
  if (typeof window === "undefined") {
    return {
      productsCount: 0,
      variantsCount: 0,
      embeddingsSynced: 0,
      embeddingsRemoved: 0,
    };
  }

  const db = getVisualSearchDB();

  // 1. Sync products & variants (paginated 200 rows/page)
  const [rawProducts, rawVariants] = await Promise.all([
    fetchAllPaginated<Record<string, unknown>>(async (from, to) => {
      const res = await supabase
        .from("products")
        .select("id, name, price, stock, barcode, category, image_url")
        .order("id", { ascending: true })
        .range(from, to);
      return {
        data: res.data as Record<string, unknown>[] | null,
        error: res.error,
      };
    }),
    fetchAllPaginated<Record<string, unknown>>(async (from, to) => {
      const res = await supabase
        .from("product_variants")
        .select("id, product_id, variant_name, variant_value, sku, price, image_url")
        .order("id", { ascending: true })
        .range(from, to);
      return {
        data: res.data as Record<string, unknown>[] | null,
        error: res.error,
      };
    }),
  ]);

  const skusByProduct = new Map<string, string[]>();
  const variants: MatchableVariant[] = rawVariants.map((v) => {
    const pid = String(v.product_id);
    const sku = v.sku ? String(v.sku) : null;
    if (sku) {
      const arr = skusByProduct.get(pid) || [];
      arr.push(sku);
      skusByProduct.set(pid, arr);
    }
    return {
      id: String(v.id),
      product_id: pid,
      variant_name: String(v.variant_name || ""),
      variant_value: String(v.variant_value || ""),
      sku,
      price: v.price !== null && v.price !== undefined ? Number(v.price) : null,
      image_url: v.image_url ? String(v.image_url) : null,
    };
  });

  const products: CachedProduct[] = rawProducts.map((p) => {
    const id = String(p.id);
    const skus = skusByProduct.get(id);
    return {
      id,
      name: String(p.name || ""),
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
      barcode: p.barcode ? String(p.barcode) : null,
      category: p.category ? String(p.category) : null,
      image_url: p.image_url ? String(p.image_url) : null,
      variant_skus: skus ? skus.join(" ") : "",
    };
  });

  await db.transaction("rw", db.products, db.variants, async () => {
    await db.products.clear();
    if (products.length > 0) await db.products.bulkPut(products);
    await db.variants.clear();
    if (variants.length > 0) await db.variants.bulkPut(variants);
  });

  // 2. Incremental embedding sync using `updated_at` cursor (200 rows/page)
  const cursorRow = await db.syncMeta.get("last_embeddings_updated_at");
  const cursor = cursorRow?.value || null;

  const newEmbeddings = await fetchAllPaginated<CachedEmbedding>(
    async (from, to) => {
      let query = supabase
        .from("product_embeddings")
        .select(
          "id, product_id, variant_id, model_name, embedding, source_image_url, updated_at"
        )
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (cursor) {
        query = query.gte("updated_at", cursor);
      }

      const res = await query;
      return {
        data: (res.data as CachedEmbedding[] | null) || null,
        error: res.error,
      };
    }
  );

  if (newEmbeddings.length > 0) {
    await db.embeddings.bulkPut(newEmbeddings);
    const maxUpdatedAt = newEmbeddings[newEmbeddings.length - 1].updated_at;
    await db.syncMeta.put({
      key: "last_embeddings_updated_at",
      value: maxUpdatedAt,
    });
  }

  // 3. Reconcile deleted embeddings against server IDs periodically (200/page)
  let embeddingsRemoved = 0;
  const lastRecRow = await db.syncMeta.get("last_reconciled_at");
  const lastRecMs = lastRecRow ? Number(lastRecRow.value) || 0 : 0;
  const shouldReconcile =
    options?.forceReconcile ||
    Date.now() - lastRecMs >= RECONCILE_INTERVAL_MS;

  if (shouldReconcile) {
    const serverIdRows = await fetchAllPaginated<{ id: string }>(
      async (from, to) => {
        const res = await supabase
          .from("product_embeddings")
          .select("id")
          .order("id", { ascending: true })
          .range(from, to);
        return {
          data: res.data as { id: string }[] | null,
          error: res.error,
        };
      }
    );

    const serverIds = new Set(serverIdRows.map((r) => r.id));
    const localIds = await db.embeddings.toCollection().primaryKeys();
    const staleIds = localIds.filter((id) => !serverIds.has(id));
    if (staleIds.length > 0) {
      await db.embeddings.bulkDelete(staleIds);
      embeddingsRemoved = staleIds.length;
    }

    await db.syncMeta.put({
      key: "last_reconciled_at",
      value: String(Date.now()),
    });
  }

  return {
    productsCount: products.length,
    variantsCount: variants.length,
    embeddingsSynced: newEmbeddings.length,
    embeddingsRemoved,
  };
}

/**
 * Offline fuzzy text search across cached IndexedDB products (name + barcode/SKU)
 * using Fuse.js.
 */
export async function searchCachedProductsOffline(
  query: string
): Promise<CachedProduct[]> {
  const db = getVisualSearchDB();
  const allProducts = await db.products.toArray();
  const trimmed = query.trim();
  if (!trimmed) return allProducts;

  const fuse = new Fuse(allProducts, {
    keys: [
      { name: "name", weight: 0.6 },
      { name: "barcode", weight: 0.25 },
      { name: "variant_skus", weight: 0.15 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });

  return fuse.search(trimmed).map((r) => r.item);
}


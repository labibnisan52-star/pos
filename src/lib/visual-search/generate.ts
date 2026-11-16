import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIP_MODEL_NAME } from "./constants";
import { getVisualSearchDB, type CachedEmbedding } from "./db";
import { computeImageEmbedding } from "./embedder";
import {
  fetchRemoteImageForEmbedding,
  prepareFileForEmbedding,
} from "./image";

export interface ImageEmbeddingInput {
  imageUrl: string;
  blob?: Blob;
  variantId?: string | null;
}

export interface BatchEmbeddingProgress {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  currentName: string;
}

/**
 * Replaces embeddings for a product (for the given image URLs) by computing
 * 512-dim CLIP vision vectors in the browser, deleting stale rows on Supabase,
 * inserting fresh rows, and mirroring to Dexie IndexedDB.
 */
export async function replaceProductEmbeddings(
  supabase: SupabaseClient,
  productId: string,
  images: ImageEmbeddingInput[]
): Promise<number> {
  const validImages = images.filter((img) => Boolean(img.imageUrl?.trim()));

  // Remove old embeddings for this product on Supabase + local Dexie
  const { error: delError } = await supabase
    .from("product_embeddings")
    .delete()
    .eq("product_id", productId);

  if (delError) {
    throw new Error(`Could not clear old embeddings: ${delError.message}`);
  }

  const db = getVisualSearchDB();
  await db.embeddings.where("product_id").equals(productId).delete();

  if (validImages.length === 0) return 0;

  const rowsToInsert: Array<{
    product_id: string;
    variant_id: string | null;
    model_name: string;
    embedding: number[];
    source_image_url: string;
  }> = [];

  for (const item of validImages) {
    const preparedBlob = item.blob
      ? await prepareFileForEmbedding(item.blob)
      : await fetchRemoteImageForEmbedding(item.imageUrl);

    const { embedding } = await computeImageEmbedding(preparedBlob);
    rowsToInsert.push({
      product_id: productId,
      variant_id: item.variantId ?? null,
      model_name: CLIP_MODEL_NAME,
      embedding,
      source_image_url: item.imageUrl,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("product_embeddings")
    .insert(rowsToInsert)
    .select(
      "id, product_id, variant_id, model_name, embedding, source_image_url, updated_at"
    );

  if (insertError) {
    throw new Error(`Could not save embeddings: ${insertError.message}`);
  }

  if (inserted && inserted.length > 0) {
    await db.embeddings.bulkPut(inserted as CachedEmbedding[]);
  }

  return inserted?.length ?? 0;
}

/**
 * Owner-only batch job: generates embeddings for all products that have an
 * image_url but do not yet have a matching embedding in `product_embeddings`.
 */
export async function generateMissingProductEmbeddings(
  supabase: SupabaseClient,
  onProgress: (progress: BatchEmbeddingProgress) => void,
  options?: { batchSize?: number; signal?: AbortSignal }
): Promise<BatchEmbeddingProgress> {
  const batchSize = options?.batchSize ?? 5;

  // Fetch all products with images (200 per page)
  const products: Array<{ id: string; name: string; image_url: string | null }> =
    [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, image_url")
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + 199);
    if (error) throw new Error(error.message);
    const rows = data || [];
    products.push(...rows);
    if (rows.length < 200) break;
    from += 200;
  }

  // Fetch existing embeddings (product_id + source_image_url) in 200-row pages
  const existingByProduct = new Map<string, Set<string>>();
  let eFrom = 0;
  while (true) {
    const { data, error } = await supabase
      .from("product_embeddings")
      .select("product_id, source_image_url")
      .range(eFrom, eFrom + 199);
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const r of rows) {
      const pid = String(r.product_id);
      const set = existingByProduct.get(pid) || new Set<string>();
      if (r.source_image_url) set.add(String(r.source_image_url));
      existingByProduct.set(pid, set);
    }
    if (rows.length < 200) break;
    eFrom += 200;
  }

  const pending = products.filter((p) => {
    const url = (p.image_url || "").trim();
    if (!url) return false;
    const existingUrls = existingByProduct.get(p.id);
    return !existingUrls || !existingUrls.has(url);
  });

  const stats: BatchEmbeddingProgress = {
    processed: 0,
    total: pending.length,
    succeeded: 0,
    failed: 0,
    currentName: "",
  };
  onProgress({ ...stats });

  for (let i = 0; i < pending.length; i += batchSize) {
    if (options?.signal?.aborted) break;
    const chunk = pending.slice(i, i + batchSize);

    for (const prod of chunk) {
      if (options?.signal?.aborted) break;
      stats.currentName = prod.name;
      onProgress({ ...stats });

      try {
        await replaceProductEmbeddings(supabase, prod.id, [
          { imageUrl: prod.image_url! },
        ]);
        stats.succeeded += 1;
      } catch (err) {
        console.warn(`Embedding failed for ${prod.name}:`, err);
        stats.failed += 1;
      } finally {
        stats.processed += 1;
        onProgress({ ...stats });
      }
    }
  }

  stats.currentName = "";
  onProgress({ ...stats });
  return stats;
}


import { VISUAL_MATCH_THRESHOLD, VISUAL_TOP_K } from "./constants.ts";

export interface EmbeddingCandidate {
  id: string;
  product_id: string;
  variant_id: string | null;
  embedding: number[];
  source_image_url?: string | null;
}

export interface MatchableProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  barcode?: string | null;
  category?: string | null;
  image_url?: string | null;
}

export interface MatchableVariant {
  id: string;
  product_id: string;
  variant_name: string;
  variant_value: string;
  sku?: string | null;
  price?: number | null;
  image_url?: string | null;
}

export interface VisualSearchMatch {
  product: MatchableProduct;
  variant: MatchableVariant | null;
  score: number;
  confidencePct: number;
  sourceImageUrl: string | null;
}

export interface VisualSearchResult {
  matches: VisualSearchMatch[];
  bestScore: number;
  meetsThreshold: boolean;
  threshold: number;
}

export function l2Normalize(vec: ArrayLike<number>): number[] {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    normSq += v * v;
  }
  const norm = Math.sqrt(normSq);
  const out = new Array<number>(vec.length);
  if (norm === 0 || !Number.isFinite(norm)) {
    for (let i = 0; i < vec.length; i++) out[i] = 0;
    return out;
  }
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / norm;
  }
  return out;
}

export function cosineSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>
): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0 || !Number.isFinite(denom)) return 0;
  const sim = dot / denom;
  return Math.max(-1, Math.min(1, sim));
}

/**
 * Ranks cached embeddings by cosine similarity against a 512-dim query vector.
 * - Deduplicates multiple angles of the same (product_id, variant_id) by keeping
 *   the highest score.
 * - Prefers variant-specific matches when variant_id is set on the embedding.
 */
export function rankVisualMatches(
  queryEmbedding: ArrayLike<number>,
  candidates: EmbeddingCandidate[],
  productsById: Map<string, MatchableProduct>,
  variantsById: Map<string, MatchableVariant>,
  options?: {
    topK?: number;
    threshold?: number;
  }
): VisualSearchResult {
  const topK = options?.topK ?? VISUAL_TOP_K;
  const threshold = options?.threshold ?? VISUAL_MATCH_THRESHOLD;

  const bestByKey = new Map<
    string,
    {
      product: MatchableProduct;
      variant: MatchableVariant | null;
      score: number;
      sourceImageUrl: string | null;
    }
  >();

  for (const cand of candidates) {
    const product = productsById.get(cand.product_id);
    if (!product) continue;

    const variant = cand.variant_id
      ? variantsById.get(cand.variant_id) ?? null
      : null;

    const score = cosineSimilarity(queryEmbedding, cand.embedding);
    const key = `${cand.product_id}::${variant ? variant.id : ""}`;
    const existing = bestByKey.get(key);

    if (!existing || score > existing.score) {
      bestByKey.set(key, {
        product,
        variant,
        score,
        sourceImageUrl: cand.source_image_url ?? variant?.image_url ?? product.image_url ?? null,
      });
    }
  }

  // If a product has a variant-specific match that scores at least as well as
  // (or within 0.02 of) its generic product-level embedding, prefer the variant.
  const entries = Array.from(bestByKey.values());
  const hasVariantMatch = new Set(
    entries.filter((e) => e.variant !== null).map((e) => e.product.id)
  );

  const filtered = entries.filter((e) => {
    if (e.variant !== null) return true;
    if (!hasVariantMatch.has(e.product.id)) return true;
    const bestVariantScore = entries
      .filter((v) => v.product.id === e.product.id && v.variant !== null)
      .reduce((max, v) => Math.max(max, v.score), -1);
    return e.score > bestVariantScore + 0.02;
  });

  filtered.sort((a, b) => b.score - a.score);

  const matches: VisualSearchMatch[] = filtered.slice(0, topK).map((entry) => ({
    product: entry.product,
    variant: entry.variant,
    score: entry.score,
    confidencePct: Math.max(0, Math.min(100, Math.round(entry.score * 100))),
    sourceImageUrl: entry.sourceImageUrl,
  }));

  const bestScore = matches.length > 0 ? matches[0].score : 0;
  return {
    matches,
    bestScore,
    meetsThreshold: bestScore >= threshold,
    threshold,
  };
}

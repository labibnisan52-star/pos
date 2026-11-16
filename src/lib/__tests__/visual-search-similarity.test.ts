import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  l2Normalize,
  rankVisualMatches,
  type EmbeddingCandidate,
  type MatchableProduct,
  type MatchableVariant,
} from "../visual-search/similarity.ts";
import { VISUAL_MATCH_THRESHOLD } from "../visual-search/constants.ts";

describe("Visual Search Similarity Engine (src/lib/visual-search/similarity.ts)", () => {
  it("normalizes vectors to unit length", () => {
    const norm = l2Normalize([3, 4]);
    assert.ok(Math.abs(norm[0] - 0.6) < 1e-6);
    assert.ok(Math.abs(norm[1] - 0.8) < 1e-6);
    assert.deepEqual(l2Normalize([0, 0]), [0, 0]);
  });

  it("computes cosine similarity accurately", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-6);
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0]) - 0) < 1e-6);
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [-1, 0, 0]) + 1) < 1e-6);
  });

  it("returns top 5 deduplicated matches and prefers variant_id when set", () => {
    const products = new Map<string, MatchableProduct>([
      ["p1", { id: "p1", name: "Classic Panjabi", price: 1200, stock: 10 }],
      ["p2", { id: "p2", name: "Cotton Shirt", price: 900, stock: 5 }],
      ["p3", { id: "p3", name: "Denim Jeans", price: 1500, stock: 8 }],
      ["p4", { id: "p4", name: "Leather Belt", price: 600, stock: 12 }],
      ["p5", { id: "p5", name: "Canvas Cap", price: 350, stock: 20 }],
      ["p6", { id: "p6", name: "Wool Scarf", price: 500, stock: 4 }],
    ]);

    const variants = new Map<string, MatchableVariant>([
      [
        "v1",
        {
          id: "v1",
          product_id: "p1",
          variant_name: "Color",
          variant_value: "Crimson",
          sku: "PAN-RED",
        },
      ],
    ]);

    const candidates: EmbeddingCandidate[] = [
      // Generic angle for p1 (slightly lower than variant angle)
      { id: "e0", product_id: "p1", variant_id: null, embedding: [0.85, 0.5, 0] },
      // Specific variant angle for p1 (best match)
      { id: "e1", product_id: "p1", variant_id: "v1", embedding: [0.99, 0.1, 0] },
      // Another angle for the same variant (should deduplicate)
      { id: "e2", product_id: "p1", variant_id: "v1", embedding: [0.70, 0.7, 0] },
      { id: "e3", product_id: "p2", variant_id: null, embedding: [0.8, 0.6, 0] },
      { id: "e4", product_id: "p3", variant_id: null, embedding: [0.6, 0.8, 0] },
      { id: "e5", product_id: "p4", variant_id: null, embedding: [0.5, 0.86, 0] },
      { id: "e6", product_id: "p5", variant_id: null, embedding: [0.3, 0.95, 0] },
      { id: "e7", product_id: "p6", variant_id: null, embedding: [0.1, 0.99, 0] },
    ];

    const res = rankVisualMatches([1, 0, 0], candidates, products, variants);
    assert.equal(res.matches.length, 5);
    assert.equal(res.matches[0].product.id, "p1");
    assert.equal(res.matches[0].variant?.id, "v1");
    assert.equal(res.meetsThreshold, true);
    assert.equal(res.threshold, VISUAL_MATCH_THRESHOLD);
  });

  it("flags meetsThreshold false when best score is below threshold", () => {
    const products = new Map<string, MatchableProduct>([
      ["p1", { id: "p1", name: "Item", price: 100, stock: 2 }],
    ]);
    const candidates: EmbeddingCandidate[] = [
      { id: "e1", product_id: "p1", variant_id: null, embedding: [0.3, 0.95, 0] },
    ];
    const res = rankVisualMatches([1, 0, 0], candidates, products, new Map());
    assert.equal(res.meetsThreshold, false);
    assert.ok(res.bestScore < VISUAL_MATCH_THRESHOLD);
  });
});


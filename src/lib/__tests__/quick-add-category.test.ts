import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bucketForCategory,
  parseCategoryCommand,
} from "../quick-add/category.ts";

describe("Quick Add categories (src/lib/quick-add/category.ts)", () => {
  it("recognises #Category commands", () => {
    assert.deepEqual(parseCategoryCommand("#Panjabi"), {
      kind: "category",
      name: "Panjabi",
    });
    assert.deepEqual(parseCategoryCommand("  #  Home   Goods "), {
      kind: "category",
      name: "Home Goods",
    });
  });

  it("ignores normal product text", () => {
    assert.equal(parseCategoryCommand("Red Panjabi, 800, 1200, 15"), null);
  });

  it("rejects an empty or too long category", () => {
    assert.deepEqual(parseCategoryCommand("#"), { kind: "invalid" });
    assert.deepEqual(parseCategoryCommand("#" + "a".repeat(41)), {
      kind: "invalid",
    });
  });

  it("builds a valid bucket id from the category name", () => {
    assert.equal(bucketForCategory("Panjabi"), "cat-panjabi");
    assert.equal(bucketForCategory("Home Goods"), "cat-home-goods");
    assert.equal(bucketForCategory("Men's / Shirts!"), "cat-men-s-shirts");
  });

  it("uses a stable hash for names without Latin letters", () => {
    const a = bucketForCategory("পাঞ্জাবি");
    assert.match(a, /^cat-u[a-z0-9]+$/);
    assert.equal(a, bucketForCategory("পাঞ্জাবি"));
    assert.notEqual(a, bucketForCategory("শার্ট"));
  });

  it("always satisfies the bucket id rule used by the SQL function", () => {
    for (const name of ["A", "x".repeat(40), "৳৳৳", "Mixed লাল Red"]) {
      assert.match(bucketForCategory(name), /^cat-[a-z0-9-]{1,58}$/);
    }
  });
});


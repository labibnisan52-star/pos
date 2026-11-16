import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "../quick-add/parse.ts";

describe("Quick Add parser (src/lib/quick-add/parse.ts)", () => {
  it("parses the standard format", () => {
    assert.deepEqual(parseQuickAdd("Red Panjabi, 800, 1200, 15"), {
      ok: true,
      value: { name: "Red Panjabi", cost: 800, sell: 1200, stock: 15 },
    });
  });

  it("trims extra spaces and accepts a trailing comma", () => {
    assert.deepEqual(parseQuickAdd("  Blue   Shirt ,800 ,  1200,15 , "), {
      ok: true,
      value: { name: "Blue Shirt", cost: 800, sell: 1200, stock: 15 },
    });
  });

  it("accepts Bengali digits and the Arabic/fullwidth comma", () => {
    assert.deepEqual(parseQuickAdd("লাল পাঞ্জাবি، ৮০০، ১২০০، ১৫"), {
      ok: true,
      value: { name: "লাল পাঞ্জাবি", cost: 800, sell: 1200, stock: 15 },
    });
    assert.deepEqual(parseQuickAdd("Cap，১০০，১৫০，৩"), {
      ok: true,
      value: { name: "Cap", cost: 100, sell: 150, stock: 3 },
    });
  });

  it("accepts decimal prices", () => {
    assert.deepEqual(parseQuickAdd("Socks, 49.5, 80, 20"), {
      ok: true,
      value: { name: "Socks", cost: 49.5, sell: 80, stock: 20 },
    });
  });

  it("rejects the wrong number of values", () => {
    assert.equal(parseQuickAdd("Red Panjabi, 800, 1200").ok, false);
    assert.equal(parseQuickAdd("Red Panjabi, 800, 1200, 15, 7").ok, false);
    assert.equal(parseQuickAdd("Red Panjabi").ok, false);
    assert.equal(parseQuickAdd("").ok, false);
  });

  it("rejects non-numeric, negative or fractional-stock values", () => {
    assert.equal(parseQuickAdd("Red Panjabi, abc, 1200, 15").ok, false);
    assert.equal(parseQuickAdd("Red Panjabi, 800, 1200, many").ok, false);
    assert.equal(parseQuickAdd("Red Panjabi, -800, 1200, 15").ok, false);
    assert.equal(parseQuickAdd("Red Panjabi, 800, 1200, 1.5").ok, false);
  });

  it("rejects an empty name", () => {
    assert.equal(parseQuickAdd(", 800, 1200, 15").ok, false);
  });
});


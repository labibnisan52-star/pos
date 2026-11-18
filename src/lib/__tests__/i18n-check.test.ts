import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bn } from "../i18n/bn.ts";
import { en } from "../i18n/en.ts";

function collectLeafKeys(
  obj: Record<string, unknown>,
  prefix = ""
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [ck, cv] of collectLeafKeys(
        v as Record<string, unknown>,
        fullKey
      )) {
        result.set(ck, cv);
      }
    } else {
      result.set(fullKey, String(v ?? ""));
    }
  }
  return result;
}

describe("i18n Dictionary & Regression Check", () => {
  it("every key in en exists in bn and vice versa with non-empty values", () => {
    const enKeys = collectLeafKeys(en as unknown as Record<string, unknown>);
    const bnKeys = collectLeafKeys(bn as unknown as Record<string, unknown>);

    for (const [key] of enKeys) {
      assert.ok(
        bnKeys.has(key),
        `Missing Bengali translation key "${key}" in src/lib/i18n/bn.ts`
      );
      assert.ok(
        (bnKeys.get(key) || "").trim().length > 0,
        `Empty Bengali translation for key "${key}"`
      );
    }

    for (const [key] of bnKeys) {
      assert.ok(
        enKeys.has(key),
        `Extra key "${key}" in bn.ts missing from src/lib/i18n/en.ts`
      );
    }
  });

  it("preserves required Bengali checkout, scan sheet, and stock strings", () => {
    assert.equal(bn.checkout.amountReceived, "প্রাপ্ত টাকা (৳)");
    assert.equal(bn.checkout.exact, "সমপরিমাণ");
    assert.equal(bn.checkout.dueZero, "৳0 বাকি");
    assert.equal(bn.checkout.subtotal, "সাবটোটাল");
    assert.equal(bn.checkout.discount, "ছাড়");
    assert.equal(bn.checkout.grandTotal, "সর্বমোট");
    assert.equal(bn.checkout.changeToReturn, "ফেরত দিতে হবে");
    assert.equal(bn.checkout.dueAmount, "বাকি টাকা");
    assert.equal(bn.checkout.paid, "পরিশোধিত");
    assert.equal(bn.checkout.unpaid, "বাকি");
    assert.equal(bn.checkout.completeSale, "বিক্রয় সম্পন্ন করুন");

    assert.equal(bn.scanSheet.addedToCart, "কার্টে যোগ হয়েছে");
    assert.equal(bn.scanSheet.cartSummary, "কার্ট ({count} টি আইটেম)");
    assert.equal(bn.scanSheet.askAddMore, "আরও প্রোডাক্ট অ্যাড করতে চান?");
    assert.equal(bn.scanSheet.yes, "হ্যাঁ");
    assert.equal(bn.scanSheet.no, "না");

    assert.ok(bn.stock.outOfStock.includes("স্টক নেই! এই প্রোডাক্টটি স্টকে নেই।"));
    assert.ok(bn.stock.stockExhausted.includes("স্টক শেষ!"));
    assert.ok(bn.stock.productNotFound.includes("প্রোডাক্ট পাওয়া যায়নি (বারকোড: {code})"));
  });

  it("guards centralized POS scan/toast components against hardcoded English regressions", () => {
    const filesToCheck = [
      "src/components/pos/ScanMiniCartSheet.tsx",
      "src/components/BarcodeScanner.tsx",
      "src/components/ui/pos-toast.tsx",
      "src/lib/stock-validation.ts",
    ];

    const forbiddenHardcodedLiterals = [
      ">ADDED TO CART<",
      ">Scan Barcode<",
      ">Amount Received<",
      ">Complete Sale<",
      ">Change to Return<",
      ">Due Amount<",
      "Align barcode within the frame",
      "Insufficient stock for",
      "is out of stock.",
    ];

    for (const relPath of filesToCheck) {
      const absPath = path.join(process.cwd(), relPath);
      const source = fs.readFileSync(absPath, "utf8");
      for (const literal of forbiddenHardcodedLiterals) {
        assert.ok(
          !source.includes(literal),
          `Hardcoded English string "${literal}" found in ${relPath}. Use t(...) from @/lib/i18n instead.`
        );
      }
    }
  });
});


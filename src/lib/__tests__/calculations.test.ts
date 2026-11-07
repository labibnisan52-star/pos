import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCartTotals,
  calculateLineTotal,
  calculateNewStock,
  calculateReturnTotals,
  calculateSavedOrderProfit,
  parseNumericInput,
  roundMoney,
  validateSaleInput,
} from "../calculations.ts";

describe("Rizq POS Shared Calculation Engine (src/lib/calculations.ts)", () => {
  it("1. no discount: items 500 + 300 -> subtotal 800, grand_total 800", () => {
    const res = calculateCartTotals({
      items: [
        { unitPrice: 500, quantity: 1 },
        { unitPrice: 300, quantity: 1 },
      ],
      discountType: "fixed",
      discountValue: 0,
      amountReceived: 800,
    });

    assert.equal(res.subtotal, 800);
    assert.equal(res.discountAmount, 0);
    assert.equal(res.grandTotal, 800);
    assert.equal(res.paymentStatus, "Paid");
    assert.equal(res.dueAmount, 0);
    assert.equal(res.changeToReturn, 0);
  });

  it("2. 10% discount on 800 -> discount 80, grand_total 720", () => {
    const res = calculateCartTotals({
      items: [
        { unitPrice: 500, quantity: 1 },
        { unitPrice: 300, quantity: 1 },
      ],
      discountType: "percentage",
      discountValue: "10",
      amountReceived: "720",
    });

    assert.equal(res.subtotal, 800);
    assert.equal(res.discountType, "percentage");
    assert.equal(res.discountValue, 10);
    assert.equal(res.discountAmount, 80);
    assert.equal(res.grandTotal, 720);
  });

  it("3. fixed ৳50 discount on 800 -> discount 50, grand_total 750", () => {
    const res = calculateCartTotals({
      items: [
        { unitPrice: 500, quantity: 1 },
        { unitPrice: 300, quantity: 1 },
      ],
      discountType: "fixed",
      discountValue: "50",
      amountReceived: "750",
    });

    assert.equal(res.subtotal, 800);
    assert.equal(res.discountType, "fixed");
    assert.equal(res.discountAmount, 50);
    assert.equal(res.grandTotal, 750);
  });

  it("4. fixed discount larger than subtotal (৳1000 on 800) -> discount 800, grand_total 0", () => {
    const res = calculateCartTotals({
      items: [
        { unitPrice: 500, quantity: 1 },
        { unitPrice: 300, quantity: 1 },
      ],
      discountType: "fixed",
      discountValue: 1000,
      amountReceived: 0,
    });

    assert.equal(res.subtotal, 800);
    assert.equal(res.discountAmount, 800);
    assert.equal(res.grandTotal, 0);
    assert.equal(res.dueAmount, 0);
    assert.equal(res.paymentStatus, "Paid");
  });

  it("5. 100% discount -> grand_total 0", () => {
    const res = calculateCartTotals({
      items: [{ unitPrice: 1250, quantity: 2 }],
      discountType: "percentage",
      discountValue: 100,
      amountReceived: 0,
    });

    assert.equal(res.subtotal, 2500);
    assert.equal(res.discountAmount, 2500);
    assert.equal(res.grandTotal, 0);
    assert.equal(res.paymentStatus, "Paid");
  });

  it("6. percentage above 100 (e.g. 150%) -> clamped to 100%", () => {
    const res = calculateCartTotals({
      items: [{ unitPrice: 800, quantity: 1 }],
      discountType: "percentage",
      discountValue: "150",
      amountReceived: 0,
    });

    assert.equal(res.discountValue, 100);
    assert.equal(res.discountAmount, 800);
    assert.equal(res.grandTotal, 0);
  });

  it("7. decimal prices: 99.99 × 3 with 10% discount -> no floating-point error", () => {
    const res = calculateCartTotals({
      items: [{ unitPrice: "99.99", quantity: 3 }],
      discountType: "percentage",
      discountValue: "10",
      amountReceived: "269.97",
    });

    // 99.99 * 3 = 299.97; 10% of 299.97 = 29.997 -> rounds to 30.00; grand_total = 269.97
    assert.equal(res.subtotal, 299.97);
    assert.equal(res.discountAmount, 30);
    assert.equal(res.grandTotal, 269.97);
    assert.equal(roundMoney(res.subtotal - res.discountAmount), res.grandTotal);
    assert.equal(String(res.grandTotal), "269.97");
  });

  it("8. 3 items with 7.5% discount -> rounding is correct and consistent", () => {
    const res = calculateCartTotals({
      items: [
        { unitPrice: "350.00", quantity: 1 },
        { unitPrice: "275.50", quantity: 1 },
        { unitPrice: "199.99", quantity: 1 },
      ],
      discountType: "percentage",
      discountValue: "7.5",
      amountReceived: "800",
    });

    // Subtotal = 825.49; 825.49 * 7.5% = 61.91175 -> rounds to 61.91; Grand Total = 825.49 - 61.91 = 763.58
    assert.equal(res.subtotal, 825.49);
    assert.equal(res.discountAmount, 61.91);
    assert.equal(res.grandTotal, 763.58);
    assert.equal(
      Number((res.subtotal - res.discountAmount).toFixed(2)),
      res.grandTotal
    );

    // Sum of per-item net amounts equals grandTotal exactly
    const netSum = roundMoney(
      res.items.reduce((s, it) => s + it.netAmount, 0)
    );
    assert.equal(netSum, res.grandTotal);
  });

  it("9. empty, negative, text or NaN discount -> treated as 0", () => {
    const baseItems = [{ unitPrice: 800, quantity: 1 }];

    for (const invalidVal of ["", "   ", "-25", -10, "abc", "10%off", Number.NaN]) {
      const fixedRes = calculateCartTotals({
        items: baseItems,
        discountType: "fixed",
        discountValue: invalidVal as string | number,
      });
      assert.equal(fixedRes.discountAmount, 0);
      assert.equal(fixedRes.grandTotal, 800);

      const pctRes = calculateCartTotals({
        items: baseItems,
        discountType: "percentage",
        discountValue: invalidVal as string | number,
      });
      assert.equal(pctRes.discountAmount, 0);
      assert.equal(pctRes.grandTotal, 800);
    }
  });

  it("10. amount received higher than total -> correct change and Paid status", () => {
    const res = calculateCartTotals({
      items: [{ unitPrice: 720, quantity: 1 }],
      discountType: "fixed",
      discountValue: 0,
      amountReceived: "1,000",
    });

    assert.equal(res.grandTotal, 720);
    assert.equal(res.amountReceived, 1000);
    assert.equal(res.paidAmount, 720);
    assert.equal(res.changeToReturn, 280);
    assert.equal(res.dueAmount, 0);
    assert.equal(res.paymentStatus, "Paid");
  });

  it("11. amount received lower than total -> correct due and 'Partial' status", () => {
    const res = calculateCartTotals({
      items: [{ unitPrice: 1200, quantity: 1 }],
      discountType: "percentage",
      discountValue: 10, // grandTotal = 1080
      amountReceived: "500",
    });

    assert.equal(res.grandTotal, 1080);
    assert.equal(res.amountReceived, 500);
    assert.equal(res.paidAmount, 500);
    assert.equal(res.changeToReturn, 0);
    assert.equal(res.dueAmount, 580);
    assert.equal(res.paymentStatus, "Partial");
  });

  it("12. amount received 0 -> 'Unpaid' status", () => {
    const resZero = calculateCartTotals({
      items: [{ unitPrice: 800, quantity: 1 }],
      amountReceived: 0,
    });
    assert.equal(resZero.dueAmount, 800);
    assert.equal(resZero.paidAmount, 0);
    assert.equal(resZero.changeToReturn, 0);
    assert.equal(resZero.paymentStatus, "Unpaid");

    const resEmpty = calculateCartTotals({
      items: [{ unitPrice: 800, quantity: 1 }],
      amountReceived: "",
    });
    assert.equal(resEmpty.dueAmount, 800);
    assert.equal(resEmpty.paidAmount, 0);
    assert.equal(resEmpty.paymentStatus, "Unpaid");
  });

  it("13. item-share refund: 2 items, 10% discount, returning one item refunds only its net amount", () => {
    // Item A: 500, Item B: 300 -> Subtotal = 800, 10% discount = 80, Grand Total = 720
    // Item A discount share = 80 * (500/800) = 50 -> net = 450
    // Item B discount share = 80 * (300/800) = 30 -> net = 270
    const cartTotals = calculateCartTotals({
      items: [
        { id: "item-a", unitPrice: 500, quantity: 1 },
        { id: "item-b", unitPrice: 300, quantity: 1 },
      ],
      discountType: "percentage",
      discountValue: 10,
      amountReceived: 720,
    });

    assert.equal(cartTotals.items[0].discountShare, 50);
    assert.equal(cartTotals.items[0].netAmount, 450);
    assert.equal(cartTotals.items[1].discountShare, 30);
    assert.equal(cartTotals.items[1].netAmount, 270);

    // Returning ONLY Item A
    const returnRes = calculateReturnTotals({
      items: [
        {
          orderItemId: "oi-a",
          unitPrice: 500,
          originalQty: 1,
          returnQty: 1,
          selected: true,
        },
        {
          orderItemId: "oi-b",
          unitPrice: 300,
          originalQty: 1,
          returnQty: 1,
          selected: false,
        },
      ],
      orderDiscountAmount: 80,
      orderGrandTotal: 720,
    });

    assert.equal(returnRes.grossReturnSubtotal, 500);
    assert.equal(returnRes.discountAdjustment, 50);
    assert.equal(returnRes.netItemsRefund, 450);
    assert.equal(returnRes.totalRefund, 450);
  });

  it("14. gross profit is reduced by discount and matches saved grand_total", () => {
    const res = calculateCartTotals({
      items: [{ unitPrice: 1500, quantity: 2, costPrice: 900 }],
      discountType: "fixed",
      discountValue: 300,
      amountReceived: 2700,
    });

    assert.equal(res.costTotal, 1800);
    assert.equal(res.grandTotal, 2700);
    assert.equal(res.grossProfit, 900);

    const reportProfit = calculateSavedOrderProfit(res.grandTotal, [
      { costPrice: 900, quantity: 2 },
    ]);
    assert.equal(reportProfit.grossProfit, 900);
  });

  it("15. stock validation blocks quantity > stock and due sale requires customer", () => {
    assert.deepEqual(calculateNewStock(5, 3), {
      allowed: true,
      oldStock: 5,
      requiredQty: 3,
      newStock: 2,
      deficit: 0,
    });
    assert.equal(calculateNewStock(2, 3).allowed, false);
    assert.equal(calculateNewStock(2, 3).newStock, 2);

    const missingCustomer = validateSaleInput({
      items: [
        {
          id: "p1",
          name: "Leather Loafer",
          unitPrice: 1200,
          quantity: 1,
          availableStock: 5,
        },
      ],
      discountType: "fixed",
      discountRaw: "0",
      amountReceivedRaw: "500",
      customerName: "",
    });
    assert.equal(missingCustomer.valid, false);
    assert.ok(
      missingCustomer.errors.some((e) => e.toLowerCase().includes("customer"))
    );

    const withCustomer = validateSaleInput({
      items: [
        {
          id: "p1",
          name: "Leather Loafer",
          unitPrice: 1200,
          quantity: 1,
          availableStock: 5,
        },
      ],
      discountType: "fixed",
      discountRaw: "0",
      amountReceivedRaw: "500",
      customerName: "Rahim Uddin",
    });
    assert.equal(withCustomer.valid, true);
  });

  it("16. parses formatted comma strings safely and computes line total", () => {
    assert.equal(parseNumericInput(" 1,450.75 ").value, 1450.75);
    assert.equal(calculateLineTotal("1,000", 2, "50"), 1900);
  });
});

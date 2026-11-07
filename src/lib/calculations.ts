/**
 * Centralized money, discount, payment, profit, refund, and stock calculations
 * for Rizq POS.
 *
 * IMPORTANT:
 * - All monetary amounts are in ৳ BDT.
 * - Tax / VAT is ALWAYS 0 in Rizq POS (never added or displayed).
 * - All math is executed in integer paisa (1 BDT = 100 paisa) to eliminate
 *   IEEE-754 floating-point drift, ensuring UI, API, DB, receipt, and reports
 *   always produce identical numbers.
 */

export type DiscountType = "percentage" | "fixed";
export type PaymentStatus = "Paid" | "Partial" | "Unpaid";

export interface ParsedNumberResult {
  value: number;
  isValid: boolean;
  isEmpty: boolean;
}

export interface CalcItemInput {
  id?: string;
  unitPrice: number | string;
  quantity: number | string;
  costPrice?: number | string | null;
  itemDiscountPerUnit?: number | string | null;
}

export interface CalcLineItem {
  id?: string;
  unitPrice: number;
  quantity: number;
  costPrice: number;
  itemDiscountPerUnit: number;
  effectiveUnitPrice: number;
  lineTotal: number;
  costLineTotal: number;
  discountShare: number;
  netAmount: number;
}

export interface CartTotalsInput {
  items: CalcItemInput[];
  discountType?: DiscountType | string | null;
  discountValue?: number | string | null;
  amountReceived?: number | string | null;
}

export interface CartTotalsResult {
  items: CalcLineItem[];
  itemCount: number;
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  grandTotal: number;
  amountReceived: number;
  paidAmount: number;
  changeToReturn: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
  costTotal: number;
  grossProfit: number;
}

export interface ReturnItemCalcInput {
  orderItemId: string;
  unitPrice: number | string;
  originalQty: number | string;
  returnQty: number | string;
  selected?: boolean;
}

export interface ReturnItemCalcResult {
  orderItemId: string;
  unitPrice: number;
  originalQty: number;
  returnQty: number;
  selected: boolean;
  originalLineTotal: number;
  itemDiscountShare: number;
  itemNetAmount: number;
  refundForReturnedQty: number;
}

export interface ReturnTotalsResult {
  items: ReturnItemCalcResult[];
  grossReturnSubtotal: number;
  discountAdjustment: number;
  netItemsRefund: number;
  restockingFee: number;
  totalRefund: number;
}

export interface StockCheckResult {
  allowed: boolean;
  oldStock: number;
  requiredQty: number;
  newStock: number;
  deficit: number;
}

export interface SaleValidationInput {
  items: Array<{
    id: string;
    name: string;
    unitPrice: number | string;
    quantity: number | string;
    availableStock: number;
    stockMultiplier?: number;
  }>;
  discountType?: DiscountType | string | null;
  discountRaw?: number | string | null;
  amountReceivedRaw?: number | string | null;
  customerName?: string | null;
  customerMobile?: string | null;
}

export interface SaleValidationResult {
  valid: boolean;
  errors: string[];
  totals: CartTotalsResult;
}

const STRICT_NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const PERCENT_SCALE = 1_000_000; // 100% = 1,000,000 (supports up to 4 decimal places in %)

/**
 * Safely parses user string or numeric inputs (trims spaces, strips commas).
 */
export function parseNumericInput(
  raw: number | string | null | undefined
): ParsedNumberResult {
  if (raw === null || raw === undefined) {
    return { value: 0, isValid: true, isEmpty: true };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { value: 0, isValid: false, isEmpty: false };
    }
    return { value: raw, isValid: true, isEmpty: false };
  }

  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/,/g, "");
    if (cleaned === "") {
      return { value: 0, isValid: true, isEmpty: true };
    }
    if (!STRICT_NUMERIC_PATTERN.test(cleaned)) {
      return { value: 0, isValid: false, isEmpty: false };
    }
    const num = Number(cleaned);
    if (!Number.isFinite(num)) {
      return { value: 0, isValid: false, isEmpty: false };
    }
    return { value: num, isValid: true, isEmpty: false };
  }

  return { value: 0, isValid: false, isEmpty: false };
}

/**
 * Converts a BDT decimal amount to integer paisa (minor units, ×100) with symmetric half-up rounding.
 */
export function toPaisa(amount: number): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(amount) + Number.EPSILON) * 100);
}

/**
 * Converts integer paisa back to a 2-decimal BDT number without -0 or float artifacts.
 */
export function fromPaisa(paisa: number): number {
  if (!Number.isFinite(paisa)) return 0;
  const rounded = Math.round(paisa);
  if (rounded === 0) return 0;
  return Number((rounded / 100).toFixed(2));
}

/**
 * Rounds any BDT amount consistently to 2 decimal places via integer paisa.
 */
export function roundMoney(amount: number): number {
  return fromPaisa(toPaisa(amount));
}

/**
 * Formats a BDT number for display (e.g., "1,250.00").
 */
export function formatBDT(amount: number | string | null | undefined): string {
  const parsed = parseNumericInput(amount);
  const safe = roundMoney(parsed.isValid ? parsed.value : 0);
  return safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Validates raw discount input string/number for inline UI/API error reporting.
 */
export function validateDiscountInput(
  raw: number | string | null | undefined
): { valid: boolean; error?: string } {
  const parsed = parseNumericInput(raw);
  if (parsed.isEmpty) return { valid: true };
  if (!parsed.isValid) {
    return { valid: false, error: "Discount must be a valid number." };
  }
  if (parsed.value < 0) {
    return { valid: false, error: "Discount cannot be negative." };
  }
  return { valid: true };
}

/**
 * Equation 1: Line total = (unit_price - item_discount_per_unit) * quantity
 */
export function calculateLineTotal(
  unitPrice: number | string,
  quantity: number | string,
  itemDiscountPerUnit?: number | string | null
): number {
  const p = parseNumericInput(unitPrice);
  const q = parseNumericInput(quantity);
  const d = parseNumericInput(itemDiscountPerUnit);

  const unitPaisa = p.isValid && p.value > 0 ? toPaisa(p.value) : 0;
  const discPaisa = d.isValid && d.value > 0 ? Math.min(toPaisa(d.value), unitPaisa) : 0;
  const safeQty = q.isValid && q.value > 0 ? q.value : 0;

  const effectiveUnitPaisa = Math.max(0, unitPaisa - discPaisa);
  const lineTotalPaisa = Math.round(effectiveUnitPaisa * safeQty + Number.EPSILON);
  return fromPaisa(lineTotalPaisa);
}

/**
 * Distributes order-level discount_amount across line items according to Equation 9:
 *   item_discount_share = discount_amount * (line_total / subtotal)
 *   item_net_amount = line_total - item_discount_share
 * Uses integer paisa + largest-remainder tie-breaking so SUM(item_discount_share) === discount_amount
 * and SUM(item_net_amount) === grand_total (preventing over-refunds).
 */
function allocateDiscountSharesPaisa(
  lineTotalsPaisa: number[],
  subtotalPaisa: number,
  discountAmountPaisa: number
): number[] {
  if (
    lineTotalsPaisa.length === 0 ||
    subtotalPaisa <= 0 ||
    discountAmountPaisa <= 0
  ) {
    return lineTotalsPaisa.map(() => 0);
  }

  const clampedDiscount = Math.min(discountAmountPaisa, subtotalPaisa);
  const exactShares = lineTotalsPaisa.map(
    (lt) => (clampedDiscount * lt) / subtotalPaisa
  );
  const floorShares = exactShares.map((s) => Math.floor(s));
  let remainder =
    clampedDiscount - floorShares.reduce((sum, s) => sum + s, 0);

  if (remainder > 0) {
    const indicesByFraction = exactShares
      .map((exact, idx) => ({
        idx,
        frac: exact - floorShares[idx],
        lineTotal: lineTotalsPaisa[idx],
      }))
      .filter((entry) => entry.lineTotal > 0)
      .sort((a, b) => b.frac - a.frac || b.lineTotal - a.lineTotal);

    let cursor = 0;
    while (remainder > 0 && indicesByFraction.length > 0) {
      const target = indicesByFraction[cursor % indicesByFraction.length];
      if (floorShares[target.idx] < lineTotalsPaisa[target.idx]) {
        floorShares[target.idx] += 1;
        remainder -= 1;
      }
      cursor += 1;
      if (cursor > lineTotalsPaisa.length * 2 && remainder > 0) break;
    }
  }

  return floorShares;
}

/**
 * Master calculation function for cart, checkout, API, receipt, and reports.
 * Implements Equations 1 through 9 in integer paisa.
 */
export function calculateCartTotals(input: CartTotalsInput): CartTotalsResult {
  const normalizedType: DiscountType =
    input.discountType === "percentage" ? "percentage" : "fixed";

  // 1. Line totals & cost totals in paisa
  const intermediate = (input.items || []).map((item) => {
    const pParsed = parseNumericInput(item.unitPrice);
    const qParsed = parseNumericInput(item.quantity);
    const cParsed = parseNumericInput(item.costPrice);
    const itemDiscParsed = parseNumericInput(item.itemDiscountPerUnit);

    const unitPricePaisa =
      pParsed.isValid && pParsed.value > 0 ? toPaisa(pParsed.value) : 0;
    const itemDiscPaisa =
      itemDiscParsed.isValid && itemDiscParsed.value > 0
        ? Math.min(toPaisa(itemDiscParsed.value), unitPricePaisa)
        : 0;
    const effectiveUnitPaisa = Math.max(0, unitPricePaisa - itemDiscPaisa);

    const safeQty = qParsed.isValid && qParsed.value > 0 ? qParsed.value : 0;
    const costPaisa =
      cParsed.isValid && cParsed.value > 0 ? toPaisa(cParsed.value) : 0;

    const lineTotalPaisa = Math.round(
      effectiveUnitPaisa * safeQty + Number.EPSILON
    );
    const costLineTotalPaisa = Math.round(
      costPaisa * safeQty + Number.EPSILON
    );

    return {
      id: item.id,
      unitPricePaisa,
      itemDiscPaisa,
      effectiveUnitPaisa,
      quantity: safeQty,
      costPaisa,
      lineTotalPaisa,
      costLineTotalPaisa,
    };
  });

  // 2. Subtotal & Cost total
  const subtotalPaisa = intermediate.reduce(
    (sum, item) => sum + item.lineTotalPaisa,
    0
  );
  const costTotalPaisa = intermediate.reduce(
    (sum, item) => sum + item.costLineTotalPaisa,
    0
  );
  const itemCount = intermediate.reduce((sum, item) => sum + item.quantity, 0);

  // 3. Discount amount (only ONE discount type active at a time)
  const parsedDiscount = parseNumericInput(input.discountValue);
  let normalizedDiscountValue = 0;
  let discountAmountPaisa = 0;

  if (
    parsedDiscount.isValid &&
    !parsedDiscount.isEmpty &&
    parsedDiscount.value > 0
  ) {
    if (normalizedType === "percentage") {
      // Clamp percentage between 0 and 100
      const clampedPercent = Math.min(Math.max(parsedDiscount.value, 0), 100);
      normalizedDiscountValue = Number(clampedPercent.toFixed(4));
      const scaledPercent = Math.round(
        (clampedPercent + Number.EPSILON) * (PERCENT_SCALE / 100)
      );
      // Pure integer multiplication + half-up rounding to nearest paisa
      discountAmountPaisa = Math.floor(
        (subtotalPaisa * scaledPercent + PERCENT_SCALE / 2) / PERCENT_SCALE
      );
    } else {
      const fixedPaisa = toPaisa(parsedDiscount.value);
      normalizedDiscountValue = fromPaisa(fixedPaisa);
      discountAmountPaisa = Math.min(fixedPaisa, subtotalPaisa);
    }
  }

  // Final safety clamp: MIN(discount_amount, subtotal) and MAX(discount_amount, 0)
  discountAmountPaisa = Math.max(
    0,
    Math.min(discountAmountPaisa, subtotalPaisa)
  );

  // 4. Tax is ALWAYS 0 (no tax/VAT in Rizq POS)

  // 5. Grand total (computed directly from rounded discount_amount in paisa)
  const grandTotalPaisa = Math.max(0, subtotalPaisa - discountAmountPaisa);

  // 6. Payment calculations
  const parsedReceived = parseNumericInput(input.amountReceived);
  const amountReceivedPaisa =
    parsedReceived.isValid && !parsedReceived.isEmpty && parsedReceived.value > 0
      ? toPaisa(parsedReceived.value)
      : 0;

  const changeToReturnPaisa = Math.max(
    amountReceivedPaisa - grandTotalPaisa,
    0
  );
  const dueAmountPaisa = Math.max(grandTotalPaisa - amountReceivedPaisa, 0);
  const paidAmountPaisa = Math.min(amountReceivedPaisa, grandTotalPaisa);

  // 7. Payment status
  let paymentStatus: PaymentStatus = "Paid";
  if (dueAmountPaisa === 0) {
    paymentStatus = "Paid";
  } else if (paidAmountPaisa > 0 && dueAmountPaisa > 0) {
    paymentStatus = "Partial";
  } else {
    paymentStatus = "Unpaid";
  }

  // 8. Profit (gross_profit = grand_total - cost_total)
  const grossProfitPaisa = grandTotalPaisa - costTotalPaisa;

  // 9. Effective discount share per item
  const sharesPaisa = allocateDiscountSharesPaisa(
    intermediate.map((i) => i.lineTotalPaisa),
    subtotalPaisa,
    discountAmountPaisa
  );

  const items: CalcLineItem[] = intermediate.map((item, idx) => {
    const sharePaisa = sharesPaisa[idx] ?? 0;
    const netPaisa = Math.max(0, item.lineTotalPaisa - sharePaisa);
    return {
      id: item.id,
      unitPrice: fromPaisa(item.unitPricePaisa),
      quantity: item.quantity,
      costPrice: fromPaisa(item.costPaisa),
      itemDiscountPerUnit: fromPaisa(item.itemDiscPaisa),
      effectiveUnitPrice: fromPaisa(item.effectiveUnitPaisa),
      lineTotal: fromPaisa(item.lineTotalPaisa),
      costLineTotal: fromPaisa(item.costLineTotalPaisa),
      discountShare: fromPaisa(sharePaisa),
      netAmount: fromPaisa(netPaisa),
    };
  });

  return {
    items,
    itemCount,
    subtotal: fromPaisa(subtotalPaisa),
    discountType: normalizedType,
    discountValue: normalizedDiscountValue,
    discountAmount: fromPaisa(discountAmountPaisa),
    grandTotal: fromPaisa(grandTotalPaisa),
    amountReceived: fromPaisa(amountReceivedPaisa),
    paidAmount: fromPaisa(paidAmountPaisa),
    changeToReturn: fromPaisa(changeToReturnPaisa),
    dueAmount: fromPaisa(dueAmountPaisa),
    paymentStatus,
    costTotal: fromPaisa(costTotalPaisa),
    grossProfit: fromPaisa(grossProfitPaisa),
  };
}

/**
 * Equation 8 helper for reports/analytics using the saved order grand_total:
 *   cost_total = SUM(cost_price * quantity)
 *   gross_profit = grand_total - cost_total
 */
export function calculateSavedOrderProfit(
  savedGrandTotal: number | string,
  items: Array<{ costPrice: number | string; quantity: number | string }>
): { grandTotal: number; costTotal: number; grossProfit: number } {
  const gtParsed = parseNumericInput(savedGrandTotal);
  const grandTotalPaisa =
    gtParsed.isValid && gtParsed.value > 0 ? toPaisa(gtParsed.value) : 0;

  const costTotalPaisa = (items || []).reduce((sum, item) => {
    const c = parseNumericInput(item.costPrice);
    const q = parseNumericInput(item.quantity);
    const cPaisa = c.isValid && c.value > 0 ? toPaisa(c.value) : 0;
    const safeQty = q.isValid && q.value > 0 ? q.value : 0;
    return sum + Math.round(cPaisa * safeQty + Number.EPSILON);
  }, 0);

  return {
    grandTotal: fromPaisa(grandTotalPaisa),
    costTotal: fromPaisa(costTotalPaisa),
    grossProfit: fromPaisa(grandTotalPaisa - costTotalPaisa),
  };
}

/**
 * Equation 9 helper: Calculates proportional discount shares and exact refund amounts
 * for returned items on an existing order so a customer is never refunded more than
 * the net discounted amount they paid.
 */
export function calculateReturnTotals(params: {
  items: ReturnItemCalcInput[];
  orderDiscountAmount?: number | string | null;
  orderGrandTotal?: number | string | null;
  orderPaidAmount?: number | string | null;
  restockingFee?: number | string | null;
}): ReturnTotalsResult {
  const parsedItems = (params.items || []).map((item) => {
    const p = parseNumericInput(item.unitPrice);
    const oq = parseNumericInput(item.originalQty);
    const rq = parseNumericInput(item.returnQty);

    const unitPricePaisa = p.isValid && p.value > 0 ? toPaisa(p.value) : 0;
    const originalQty = oq.isValid && oq.value > 0 ? oq.value : 0;
    const clampedReturnQty =
      rq.isValid && rq.value > 0 ? Math.min(rq.value, originalQty) : 0;
    const originalLineTotalPaisa = Math.round(
      unitPricePaisa * originalQty + Number.EPSILON
    );

    return {
      orderItemId: item.orderItemId,
      selected: item.selected !== false,
      unitPricePaisa,
      originalQty,
      returnQty: clampedReturnQty,
      originalLineTotalPaisa,
    };
  });

  const orderSubtotalPaisa = parsedItems.reduce(
    (sum, it) => sum + it.originalLineTotalPaisa,
    0
  );

  // Determine effective order discount in paisa:
  // Prefer explicit orderDiscountAmount if > 0; otherwise infer from (orderSubtotal - orderGrandTotal) if orderGrandTotal is provided.
  const explicitDiscParsed = parseNumericInput(params.orderDiscountAmount);
  const orderGrandParsed = parseNumericInput(params.orderGrandTotal);
  let orderDiscountPaisa = 0;

  if (
    explicitDiscParsed.isValid &&
    !explicitDiscParsed.isEmpty &&
    explicitDiscParsed.value > 0
  ) {
    orderDiscountPaisa = Math.min(
      toPaisa(explicitDiscParsed.value),
      orderSubtotalPaisa
    );
  } else if (
    orderGrandParsed.isValid &&
    !orderGrandParsed.isEmpty &&
    orderGrandParsed.value >= 0 &&
    orderSubtotalPaisa > 0
  ) {
    const grandPaisa = toPaisa(orderGrandParsed.value);
    if (grandPaisa < orderSubtotalPaisa) {
      orderDiscountPaisa = orderSubtotalPaisa - grandPaisa;
    }
  }

  const sharesPaisa = allocateDiscountSharesPaisa(
    parsedItems.map((i) => i.originalLineTotalPaisa),
    orderSubtotalPaisa,
    orderDiscountPaisa
  );

  let grossReturnSubtotalPaisa = 0;
  let netItemsRefundPaisa = 0;

  const resultItems: ReturnItemCalcResult[] = parsedItems.map((it, idx) => {
    const sharePaisa = sharesPaisa[idx] ?? 0;
    const itemNetPaisa = Math.max(0, it.originalLineTotalPaisa - sharePaisa);

    const ratio =
      it.originalQty > 0 ? it.returnQty / it.originalQty : 0;
    const grossReturnedLinePaisa = Math.round(
      it.unitPricePaisa * it.returnQty + Number.EPSILON
    );
    const refundForQtyPaisa =
      it.returnQty === it.originalQty
        ? itemNetPaisa
        : Math.round(itemNetPaisa * ratio + Number.EPSILON);

    if (it.selected && it.returnQty > 0) {
      grossReturnSubtotalPaisa += grossReturnedLinePaisa;
      netItemsRefundPaisa += refundForQtyPaisa;
    }

    return {
      orderItemId: it.orderItemId,
      unitPrice: fromPaisa(it.unitPricePaisa),
      originalQty: it.originalQty,
      returnQty: it.returnQty,
      selected: it.selected,
      originalLineTotal: fromPaisa(it.originalLineTotalPaisa),
      itemDiscountShare: fromPaisa(sharePaisa),
      itemNetAmount: fromPaisa(itemNetPaisa),
      refundForReturnedQty: fromPaisa(refundForQtyPaisa),
    };
  });

  // Cap net refund at what the customer actually paid if orderPaidAmount is provided
  const paidParsed = parseNumericInput(params.orderPaidAmount);
  if (
    paidParsed.isValid &&
    !paidParsed.isEmpty &&
    paidParsed.value >= 0
  ) {
    netItemsRefundPaisa = Math.min(netItemsRefundPaisa, toPaisa(paidParsed.value));
  }

  const feeParsed = parseNumericInput(params.restockingFee);
  const restockingFeePaisa =
    feeParsed.isValid && feeParsed.value > 0
      ? Math.min(toPaisa(feeParsed.value), netItemsRefundPaisa)
      : 0;

  const totalRefundPaisa = Math.max(
    0,
    netItemsRefundPaisa - restockingFeePaisa
  );
  const discountAdjustmentPaisa = Math.max(
    0,
    grossReturnSubtotalPaisa - netItemsRefundPaisa
  );

  return {
    items: resultItems,
    grossReturnSubtotal: fromPaisa(grossReturnSubtotalPaisa),
    discountAdjustment: fromPaisa(discountAdjustmentPaisa),
    netItemsRefund: fromPaisa(netItemsRefundPaisa),
    restockingFee: fromPaisa(restockingFeePaisa),
    totalRefund: fromPaisa(totalRefundPaisa),
  };
}

/**
 * Equation 10: Stock validation & deduction
 *   new_stock = old_stock - quantity_sold (never allow below 0; block if quantity > stock)
 */
export function calculateNewStock(
  oldStock: number,
  quantitySold: number,
  stockMultiplier = 1
): StockCheckResult {
  const safeOld = Number.isFinite(oldStock) ? Math.max(0, oldStock) : 0;
  const mult =
    Number.isFinite(stockMultiplier) && stockMultiplier > 0
      ? stockMultiplier
      : 1;
  const safeQty = Number.isFinite(quantitySold) ? quantitySold : 0;
  const requiredQty = safeQty * mult;

  if (safeQty <= 0 || !Number.isFinite(requiredQty)) {
    return {
      allowed: false,
      oldStock: safeOld,
      requiredQty: Math.max(0, requiredQty),
      newStock: safeOld,
      deficit: 0,
    };
  }

  if (requiredQty > safeOld) {
    return {
      allowed: false,
      oldStock: safeOld,
      requiredQty,
      newStock: safeOld,
      deficit: requiredQty - safeOld,
    };
  }

  return {
    allowed: true,
    oldStock: safeOld,
    requiredQty,
    newStock: safeOld - requiredQty,
    deficit: 0,
  };
}

/**
 * Validates a complete sale payload (used by BOTH POS UI and Server API):
 * - Non-empty cart with valid positive quantities
 * - Stock availability (aggregates multiple variants sharing the same base product ID)
 * - Valid discount input
 * - Valid amount received input
 * - Customer required when due_amount > 0
 */
export function validateSaleInput(
  input: SaleValidationInput
): SaleValidationResult {
  const errors: string[] = [];

  const totals = calculateCartTotals({
    items: (input.items || []).map((it) => ({
      id: it.id,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
    })),
    discountType: input.discountType,
    discountValue: input.discountRaw,
    amountReceived: input.amountReceivedRaw,
  });

  if (!input.items || input.items.length === 0) {
    errors.push("Cart is empty. Add at least one product to complete the sale.");
  }

  // Validate quantities and aggregate base-stock usage per product ID
  const stockByProduct = new Map<
    string,
    { name: string; available: number; requested: number }
  >();

  for (const item of input.items || []) {
    const qParsed = parseNumericInput(item.quantity);
    if (
      !qParsed.isValid ||
      qParsed.isEmpty ||
      qParsed.value <= 0 ||
      !Number.isInteger(qParsed.value)
    ) {
      errors.push(`Invalid quantity for "${item.name}". Enter a whole number of at least 1.`);
      continue;
    }

    const mult =
      item.stockMultiplier && item.stockMultiplier > 0
        ? item.stockMultiplier
        : 1;
    const needed = qParsed.value * mult;
    const existing = stockByProduct.get(item.id);
    if (existing) {
      existing.requested += needed;
    } else {
      stockByProduct.set(item.id, {
        name: item.name,
        available: Math.max(0, Number(item.availableStock) || 0),
        requested: needed,
      });
    }
  }

  for (const [, info] of stockByProduct) {
    const check = calculateNewStock(info.available, info.requested, 1);
    if (!check.allowed) {
      errors.push(
        `Insufficient stock for "${info.name}" (available: ${info.available}, in cart: ${info.requested}).`
      );
    }
  }

  // Discount validation
  const discCheck = validateDiscountInput(input.discountRaw);
  if (!discCheck.valid && discCheck.error) {
    errors.push(discCheck.error);
  }

  // Amount received validation
  const recParsed = parseNumericInput(input.amountReceivedRaw);
  if (!recParsed.isEmpty) {
    if (!recParsed.isValid) {
      errors.push("Amount received must be a valid number.");
    } else if (recParsed.value < 0) {
      errors.push("Amount received cannot be negative.");
    }
  }

  // Require customer if due_amount > 0
  const cleanName = (input.customerName || "").trim();
  const hasRealCustomer =
    cleanName.length > 0 && cleanName.toLowerCase() !== "guest";

  if (totals.dueAmount > 0 && !hasRealCustomer) {
    errors.push(
      `Customer name is required when there is a due balance (Due: ৳${formatBDT(
        totals.dueAmount
      )}).`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    totals,
  };
}


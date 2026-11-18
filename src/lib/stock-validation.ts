import { translate, type Locale } from "@/lib/i18n";

export interface StockValidationParams {
  productName: string;
  availableStock: number;
  /** Total base units of this product already in the cart */
  currentUsedStock: number;
  /** Base units being added (usually 1 or variant.stock_multiplier) */
  additionalUnits?: number;
  /** Quantity of this item/product already in cart for display */
  qtyInCart?: number;
  locale?: Locale;
}

export interface StockValidationResult {
  allowed: boolean;
  reason: "out_of_stock" | "insufficient_stock" | null;
  message: string | null;
}

/**
 * Centralized stock validation used across camera scan, catalog tap,
 * cart quantity stepper, and mini-cart sheet stepper.
 */
export function validateStock({
  productName,
  availableStock,
  currentUsedStock,
  additionalUnits = 1,
  qtyInCart,
  locale = "bn",
}: StockValidationParams): StockValidationResult {
  const safeStock = Math.max(0, Number(availableStock) || 0);

  if (safeStock <= 0) {
    return {
      allowed: false,
      reason: "out_of_stock",
      message: translate("stock.outOfStock", { productName }, locale),
    };
  }

  if (currentUsedStock + additionalUnits > safeStock) {
    const shownQty = qtyInCart ?? currentUsedStock;
    return {
      allowed: false,
      reason: "insufficient_stock",
      message: translate(
        "stock.stockExhausted",
        { productName, stock: safeStock, qtyInCart: shownQty },
        locale
      ),
    };
  }

  return {
    allowed: true,
    reason: null,
    message: null,
  };
}

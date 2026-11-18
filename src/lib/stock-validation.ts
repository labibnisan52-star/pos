import {
  STOCK_ERROR_MESSAGES,
  type ScanCartLocale,
} from "@/lib/i18n/scan-cart";

export interface StockValidationParams {
  productName: string;
  availableStock: number;
  /** Total base units of this product already in the cart */
  currentUsedStock: number;
  /** Base units being added (usually 1 or variant.stock_multiplier) */
  additionalUnits?: number;
  /** Quantity of this item/product already in cart for display */
  qtyInCart?: number;
  locale?: ScanCartLocale;
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
  const messages = STOCK_ERROR_MESSAGES[locale];

  if (safeStock <= 0) {
    return {
      allowed: false,
      reason: "out_of_stock",
      message: messages.outOfStock(productName),
    };
  }

  if (currentUsedStock + additionalUnits > safeStock) {
    const shownQty = qtyInCart ?? currentUsedStock;
    return {
      allowed: false,
      reason: "insufficient_stock",
      message: messages.stockExhausted(productName, safeStock, shownQty),
    };
  }

  return {
    allowed: true,
    reason: null,
    message: null,
  };
}


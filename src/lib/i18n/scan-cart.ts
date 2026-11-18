export type ScanCartLocale = "bn" | "en";

export const SCAN_MINI_CART_LABELS = {
  en: {
    addedToCart: "ADDED TO CART",
    scanNotice: "SCAN NOTICE",
    cartLabel: "Cart",
    itemSingular: "item",
    itemPlural: "items",
    askAddMore: "Do you want to add more products?",
    yes: "Yes",
    no: "No",
    close: "Close",
    remove: "Remove",
    decreaseQty: "Decrease quantity",
    increaseQty: "Increase quantity",
    each: "each",
    stockLimitReached: "Max stock reached",
  },
  bn: {
    addedToCart: "ADDED TO CART",
    scanNotice: "SCAN NOTICE",
    cartLabel: "Cart",
    itemSingular: "item",
    itemPlural: "items",
    askAddMore: "আরও প্রোডাক্ট অ্যাড করতে চান?",
    yes: "হ্যাঁ",
    no: "না",
    close: "বন্ধ করুন",
    remove: "সরান",
    decreaseQty: "পরিমাণ কমান",
    increaseQty: "পরিমাণ বাড়ান",
    each: "প্রতিটি",
    stockLimitReached: "সর্বোচ্চ স্টক সীমা পূর্ণ",
  },
} as const;

export const CHECKOUT_BAR_LABELS = {
  en: {
    amountReceived: "Amount Received (৳)",
    exact: "Exact",
    dueZero: "৳0 Due",
    subtotal: "Subtotal",
    discount: "Discount",
    grandTotal: "Grand Total",
    changeToReturn: "Change to Return",
    dueAmount: "Due Amount",
    changeShort: "Change",
    dueShort: "Due",
    completeSale: "Complete Sale",
    savingSale: "Saving Sale...",
  },
  bn: {
    amountReceived: "প্রাপ্ত টাকা (৳)",
    exact: "সঠিক",
    dueZero: "৳০ বাকি",
    subtotal: "মোট",
    discount: "ডিসকাউন্ট",
    grandTotal: "সর্বমোট",
    changeToReturn: "ফেরত",
    dueAmount: "বাকি",
    changeShort: "ফেরত",
    dueShort: "বাকি",
    completeSale: "বিক্রয় সম্পন্ন করুন",
    savingSale: "সংরক্ষণ হচ্ছে...",
  },
} as const;

export const STOCK_ERROR_MESSAGES = {
  bn: {
    outOfStock: (productName: string) =>
      `এই প্রোডাক্টটি স্টকে নেই। (${productName})`,
    stockExhausted: (productName: string, stock: number, qtyInCart: number) =>
      `স্টক শেষ! "${productName}" এর মাত্র ${stock} টি স্টকে আছে, আপনি ইতিমধ্যে ${qtyInCart} টি যোগ করেছেন।`,
    productNotFound: (code: string) =>
      `প্রোডাক্ট পাওয়া যায়নি (বারকোড: ${code})`,
    noStock: "স্টক নেই",
    insufficientStock: "পর্যাপ্ত স্টক নেই",
    dismiss: "বন্ধ করুন",
  },
  en: {
    outOfStock: (productName: string) =>
      `This product is out of stock. (${productName})`,
    stockExhausted: (productName: string, stock: number, qtyInCart: number) =>
      `Out of stock! Only ${stock} of "${productName}" in stock, you already added ${qtyInCart}.`,
    productNotFound: (code: string) =>
      `Product not found (Barcode: ${code})`,
    noStock: "Out of stock",
    insufficientStock: "Insufficient stock",
    dismiss: "Dismiss",
  },
} as const;


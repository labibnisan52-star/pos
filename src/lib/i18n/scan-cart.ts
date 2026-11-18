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


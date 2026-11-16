export interface QuickAddProduct {
  name: string;
  cost: number;
  sell: number;
  stock: number;
}

export type QuickAddParseResult =
  | { ok: true; value: QuickAddProduct }
  | { ok: false };

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

// ASCII comma, fullwidth comma, Arabic comma, ideographic comma
const COMMA_PATTERN = /[,\uFF0C\u060C\u3001]/;

export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)));
}

/** Plain non-negative decimal like "800" or "12.5". Returns null otherwise. */
export function parseAmount(raw: string): number | null {
  const cleaned = normalizeDigits(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export interface RawProductFields {
  name: string;
  cost: string;
  sell: string;
  stock: string;
}

/** Shared by the chat parser and the inline editor. Stock must be a whole number. */
export function validateProductFields(
  raw: RawProductFields
): QuickAddProduct | null {
  const name = raw.name.trim().replace(/\s+/g, " ");
  const cost = parseAmount(raw.cost);
  const sell = parseAmount(raw.sell);
  const stock = parseAmount(raw.stock);

  if (!name || cost === null || sell === null || stock === null) return null;
  if (!Number.isInteger(stock)) return null;

  return { name, cost, sell, stock };
}

/** "Name, cost price, selling price, stock" -> product, or { ok: false }. */
export function parseQuickAdd(input: string): QuickAddParseResult {
  const parts = input.split(COMMA_PATTERN).map((p) => p.trim());

  // Tolerate trailing commas
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();

  if (parts.length !== 4) return { ok: false };

  const value = validateProductFields({
    name: parts[0],
    cost: parts[1],
    sell: parts[2],
    stock: parts[3],
  });

  return value ? { ok: true, value } : { ok: false };
}


export const DEFAULT_CATEGORY = "Uncategorized";
export const BUCKET_PREFIX = "cat-";
const MAX_CATEGORY_LENGTH = 40;

export type CategoryCommand =
  | { kind: "category"; name: string }
  | { kind: "invalid" };

/** "#Panjabi" -> category command. Returns null when the text is not a command. */
export function parseCategoryCommand(input: string): CategoryCommand | null {
  const text = input.trim();
  if (!text.startsWith("#")) return null;

  const name = text.slice(1).trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_CATEGORY_LENGTH) return { kind: "invalid" };
  return { kind: "category", name };
}

function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * Storage bucket id for a category. Bucket ids only allow lowercase ASCII,
 * digits and hyphens, so non-Latin names (e.g. Bengali) fall back to a hash.
 * Must satisfy ^cat-[a-z0-9-]{1,58}$ (checked again in 15_category_buckets.sql).
 */
export function bucketForCategory(category: string): string {
  const ascii = category
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CATEGORY_LENGTH)
    .replace(/-+$/g, "");

  return `${BUCKET_PREFIX}${ascii || `u${shortHash(category)}`}`;
}


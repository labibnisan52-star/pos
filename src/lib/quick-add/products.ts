import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuickAddProduct } from "./parse";

// Existing bucket used by the Add Product modal (public read).
export const PRODUCT_IMAGE_BUCKET = "product_images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // randomUUID is unavailable on non-secure origins; fall through
    }
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFor(file: File): string {
  const fromType = file.type.split("/")[1]?.toLowerCase();
  if (fromType === "jpeg") return "jpg";
  if (fromType && /^[a-z0-9]+$/.test(fromType)) return fromType;
  return "jpg";
}

export function validateImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is larger than 5 MB.";
  return null;
}

export async function uploadProductImage(
  supabase: SupabaseClient,
  file: File
): Promise<{ path: string; url: string }> {
  const path = `quick-add/${uid()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** Returns true only if the object was actually removed. */
export async function removeProductImage(
  supabase: SupabaseClient,
  path: string
): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .remove([path]);
  return !error && Array.isArray(data) && data.length > 0;
}

export async function insertProduct(
  supabase: SupabaseClient,
  product: QuickAddProduct,
  category: string,
  imageUrl: string | null
): Promise<string> {
  // Same shape the Add Product modal writes, using only existing columns.
  const { data, error } = await supabase
    .from("products")
    .insert([
      {
        name: product.name,
        barcode: Math.floor(10000000 + Math.random() * 90000000).toString(),
        category: category.trim() || "Uncategorized",
        stock: product.stock,
        price: product.sell,
        cost_price: product.cost,
        image_color: "bg-gray-100",
        image_url: imageUrl,
      },
    ])
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not save the product.");
  }
  return String(data.id);
}

export async function updateProduct(
  supabase: SupabaseClient,
  id: string,
  product: QuickAddProduct
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({
      name: product.name,
      cost_price: product.cost,
      price: product.sell,
      stock: product.stock,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

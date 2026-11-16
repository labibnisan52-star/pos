import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateLineTotal, roundMoney } from "@/lib/calculations";
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
  const costBdt = roundMoney(product.cost);
  const sellBdt = roundMoney(product.sell);

  // Same shape the Add Product modal writes, using only existing columns.
  const { data, error } = await supabase
    .from("products")
    .insert([
      {
        name: product.name,
        barcode: Math.floor(10000000 + Math.random() * 90000000).toString(),
        category: category.trim() || "Uncategorized",
        stock: product.stock,
        price: sellBdt,
        cost_price: costBdt,
        image_color: "bg-gray-100",
        image_url: imageUrl,
      },
    ])
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not save the product.");
  }

  const productId = String(data.id);

  // Record initial stock intake in purchase_orders so Purchases & History stay in sync
  if (product.stock > 0) {
    const { error: poError } = await supabase.from("purchase_orders").insert([
      {
        product_id: productId,
        product_name: product.name,
        supplier_name: "Direct Intake",
        quantity: product.stock,
        remaining_quantity: product.stock,
        cost_cny: 0,
        cost_bdt: costBdt,
        shipping_bdt: 0,
        total_cost: calculateLineTotal(costBdt, product.stock),
        selling_price: sellBdt,
        payment_method: "Cash",
        received_by: "Store Manager",
        status: "Received",
      },
    ]);
    if (poError) {
      await supabase.from("products").delete().eq("id", productId);
      throw new Error(`Could not record purchase: ${poError.message}`);
    }
  }

  return productId;
}

export async function updateProduct(
  supabase: SupabaseClient,
  id: string,
  product: QuickAddProduct,
  category: string
): Promise<void> {
  const costBdt = roundMoney(product.cost);
  const sellBdt = roundMoney(product.sell);

  const { error } = await supabase
    .from("products")
    .update({
      name: product.name,
      category: category.trim() || "Uncategorized",
      cost_price: costBdt,
      price: sellBdt,
      stock: product.stock,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Keep the matching purchase_orders intake record in sync
  const { data: existingPOs } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("product_id", id);

  if (existingPOs && existingPOs.length === 1) {
    await supabase
      .from("purchase_orders")
      .update({
        product_name: product.name,
        quantity: product.stock,
        remaining_quantity: product.stock,
        cost_bdt: costBdt,
        total_cost: calculateLineTotal(costBdt, product.stock),
        selling_price: sellBdt,
      })
      .eq("id", existingPOs[0].id);
  } else if ((!existingPOs || existingPOs.length === 0) && product.stock > 0) {
    await supabase.from("purchase_orders").insert([
      {
        product_id: id,
        product_name: product.name,
        supplier_name: "Direct Intake",
        quantity: product.stock,
        remaining_quantity: product.stock,
        cost_cny: 0,
        cost_bdt: costBdt,
        shipping_bdt: 0,
        total_cost: calculateLineTotal(costBdt, product.stock),
        selling_price: sellBdt,
        payment_method: "Cash",
        received_by: "Store Manager",
        status: "Received",
      },
    ]);
  }
}

export async function deleteProduct(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  await supabase.from("purchase_orders").delete().eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

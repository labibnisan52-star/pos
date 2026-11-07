"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, CloudUpload, ScanBarcode, LayoutGrid, Trash2 } from "lucide-react";
import Barcode from "react-barcode";
import { useReactToPrint } from "react-to-print";
import { createClient } from "@/utils/supabase/client";
import { calculateLineTotal, parseNumericInput, roundMoney } from "@/lib/calculations";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productToEdit?: any;
}

interface VariantFormRow {
  image_url: string;
  variant_name: string;
  variant_value: string;
  sku: string;
  price: string;
  stock_multiplier?: number;
}

const DEFAULT_SHOE_CATEGORIES = [
  "Sneakers",
  "Formal",
  "Loafers",
  "Sandals",
  "Boots",
  "Sports",
  "Accessories",
];

const DEFAULT_SHOE_UNITS = ["Pair", "Piece", "Box", "Set"];

export default function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
  productToEdit,
}: AddProductModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("Sneakers");
  const [categories, setCategories] = useState<string[]>(DEFAULT_SHOE_CATEGORIES);
  const [stock, setStock] = useState<string>("");

  // Product Details (Note: Tax is always 0 in Rizq POS; DB tax columns are untouched)
  const [productType, setProductType] = useState("Single Product");
  const [unit, setUnit] = useState("Pair");
  const [units, setUnits] = useState<string[]>(DEFAULT_SHOE_UNITS);
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [hasWarranty, setHasWarranty] = useState(false);
  const [warranty, setWarranty] = useState("");

  // Variants (size/color for shoes)
  const [variants, setVariants] = useState<VariantFormRow[]>([]);

  // Barcode Printing
  const barcodePrintRef = useRef<HTMLDivElement>(null);
  useReactToPrint({
    contentRef: barcodePrintRef,
    documentTitle: `Barcode-${barcode || "Preview"}`,
  });

  // Purchase tracking
  const [supplierName, setSupplierName] = useState("");
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<
    "Cash" | "Card" | "Mobile Banking"
  >("Cash");

  // Funding Source
  const [fundingSource, setFundingSource] = useState<"Me" | "Investor">("Me");
  const [investorId, setInvestorId] = useState("");
  const [investors, setInvestors] = useState<{ id: string; name: string }[]>([]);

  // Image Upload
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [analyzingImage, setAnalyzingImage] = useState(false);

  // Pricing
  const [bankRate, setBankRate] = useState<string>("17.0");
  const [costCurrency, setCostCurrency] = useState<"CNY" | "BDT">("BDT");
  const [costCNY, setCostCNY] = useState<string>("");
  const [directCostBDT, setDirectCostBDT] = useState<string>("");
  const [shippingBDT, setShippingBDT] = useState<string>("");
  const [sellingPriceBDT, setSellingPriceBDT] = useState<string>("");
  const [targetMargin, setTargetMargin] = useState<string>("");

  // Derived values using shared rounding helpers
  const numericBankRate = parseNumericInput(bankRate).value;
  const numericCostCNY = parseNumericInput(costCNY).value;
  const numericDirectCostBDT = parseNumericInput(directCostBDT).value;
  const numericShippingBDT = parseNumericInput(shippingBDT).value;
  const numericSellingPriceBDT = parseNumericInput(sellingPriceBDT).value;

  const costBDT =
    costCurrency === "CNY"
      ? roundMoney(numericCostCNY * numericBankRate)
      : roundMoney(numericDirectCostBDT);
  const trueLandedCost = roundMoney(costBDT + numericShippingBDT);
  const expectedProfit = roundMoney(numericSellingPriceBDT - trueLandedCost);
  const profitMargin =
    trueLandedCost > 0 ? (expectedProfit / trueLandedCost) * 100 : 0;

  // Auto-calculate selling price when margin or cost changes
  useEffect(() => {
    const parsedMargin = parseNumericInput(targetMargin);
    if (!parsedMargin.isEmpty && parsedMargin.isValid && trueLandedCost > 0) {
      const newPrice = Math.round(trueLandedCost * (1 + parsedMargin.value / 100));
      setSellingPriceBDT(String(newPrice));
    }
  }, [targetMargin, trueLandedCost]);

  // Prevent scroll wheel from changing number inputs globally in this modal
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (
        document.activeElement &&
        document.activeElement.tagName === "INPUT" &&
        (document.activeElement as HTMLInputElement).type === "number"
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  // Reset or populate form when opened
  useEffect(() => {
    if (!isOpen) return;

    const fetchInvestors = async () => {
      const { data } = await supabase
        .from("investors")
        .select("id, name")
        .order("name");
      if (data) setInvestors(data);
    };
    fetchInvestors();

    if (productToEdit) {
      setName(productToEdit.name || "");
      setBarcode(productToEdit.barcode || "");
      const editCategory = productToEdit.category || "Sneakers";
      setCategory(editCategory);
      setCategories((prev) =>
        editCategory && !prev.includes(editCategory)
          ? [...prev, editCategory]
          : prev
      );
      setStock(
        productToEdit.stock !== undefined && productToEdit.stock !== null
          ? String(productToEdit.stock)
          : ""
      );
      setSupplierName("");
      setPurchasePaymentMethod("Cash");
      setCostCurrency("BDT");
      setCostCNY("");
      setDirectCostBDT(
        productToEdit.cost_price !== undefined && productToEdit.cost_price !== null
          ? String(productToEdit.cost_price)
          : ""
      );
      setShippingBDT("");
      setSellingPriceBDT(
        productToEdit.price !== undefined && productToEdit.price !== null
          ? String(productToEdit.price)
          : ""
      );
      setTargetMargin("");
      setErrorMsg("");
      setImageUrl(productToEdit.image_url || "");
      setAiProcessing(false);
      setBankRate("17.0");
      setProductType(productToEdit.product_type || "Single Product");
      const editUnit = productToEdit.unit || "Pair";
      setUnit(editUnit);
      setUnits((prev) =>
        editUnit && !prev.includes(editUnit) ? [...prev, editUnit] : prev
      );
      setBrand(productToEdit.brand || "");
      setDescription(productToEdit.description || "");
      setHasWarranty(!!productToEdit.warranty);
      setWarranty(productToEdit.warranty || "");
      setFundingSource(productToEdit.funding_source || "Me");
      setInvestorId(productToEdit.investor_id || "");

      // Load existing shoe variants if editing
      if (productToEdit.id) {
        supabase
          .from("product_variants")
          .select("*")
          .eq("product_id", productToEdit.id)
          .order("created_at", { ascending: true })
          .then(({ data: existingVariants }) => {
            if (existingVariants && existingVariants.length > 0) {
              setVariants(
                existingVariants.map((v: any) => ({
                  image_url: v.image_url || "",
                  variant_name: v.variant_name || "Size",
                  variant_value: v.variant_value || "",
                  sku: v.sku || "",
                  price:
                    v.price !== null && v.price !== undefined
                      ? String(v.price)
                      : "",
                  stock_multiplier: v.stock_multiplier || 1,
                }))
              );
              if (!productToEdit.product_type) {
                setProductType("Variable Product");
              }
            } else {
              setVariants([]);
            }
          });
      } else {
        setVariants([]);
      }
    } else {
      setName("");
      setBarcode(Math.floor(10000000 + Math.random() * 90000000).toString());
      setCategory("Sneakers");
      setStock("");
      setSupplierName("");
      setPurchasePaymentMethod("Cash");
      setCostCurrency("BDT");
      setCostCNY("");
      setDirectCostBDT("");
      setShippingBDT("");
      setSellingPriceBDT("");
      setTargetMargin("");
      setErrorMsg("");
      setImageUrl("");
      setAiProcessing(false);
      setBankRate("17.0");
      setProductType("Single Product");
      setUnit("Pair");
      setBrand("");
      setDescription("");
      setHasWarranty(false);
      setWarranty("");
      setVariants([]);
      setFundingSource("Me");
      setInvestorId("");
    }
  }, [isOpen, productToEdit, supabase]);

  if (!isOpen) return null;

  const handleAnalyzeImage = async () => {
    if (!imageUrl) return;
    try {
      setAnalyzingImage(true);
      setErrorMsg("");

      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const reader = new FileReader();

      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result;

        try {
          const res = await fetch("/api/analyze-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ imageBase64: base64data }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Failed to analyze image");
          }

          const data = await res.json();
          if (data.name) setName(data.name);
          if (data.category) {
            const catName = data.category;
            setCategories((prev) =>
              prev.includes(catName) ? prev : [...prev, catName]
            );
            setCategory(catName);
          }
          if (data.brand) setBrand(data.brand);
          if (data.description) setDescription(data.description);
        } catch (error: any) {
          setErrorMsg(error.message || "Failed to analyze image with AI.");
        } finally {
          setAnalyzingImage(false);
        }
      };
    } catch (error: any) {
      console.error("Error preparing image for analysis:", error);
      setErrorMsg("Failed to prepare image for AI analysis.");
      setAnalyzingImage(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      setUploadingImage(true);
      setErrorMsg("");

      let finalBlob: Blob = file;

      if (useAI) {
        setAiProcessing(true);
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          const formData = new FormData();
          formData.append("image", file);

          const aiResponse = await fetch("/api/enhance-image", {
            method: "POST",
            body: formData,
          });

          if (!aiResponse.ok) throw new Error("Backend AI failed");
          finalBlob = await aiResponse.blob();
        } catch (backendError) {
          console.warn(
            "AI enhancement failed (likely network block or API down).",
            backendError
          );
          finalBlob = file;
        }
      }

      const cleanFile = new File([finalBlob], "product-image.jpg", {
        type: "image/jpeg",
      });
      setAiProcessing(false);

      const fileName = `${Math.random().toString(36).substring(7)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("product_images")
        .upload(fileName, cleanFile, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("product_images")
        .getPublicUrl(fileName);
      setImageUrl(data.publicUrl);
    } catch (error: any) {
      console.error("Image upload error:", error);
      setErrorMsg(error.message || "Failed to process image.");
    } finally {
      setUploadingImage(false);
      setAiProcessing(false);
    }
  };

  const handleSubmit = async () => {
    const parsedPrice = parseNumericInput(sellingPriceBDT);
    if (!name.trim() || parsedPrice.isEmpty || !parsedPrice.isValid || parsedPrice.value < 0) {
      setErrorMsg("Product name and a valid selling price are required.");
      return;
    }

    const parsedStock = Math.max(0, Math.floor(parseNumericInput(stock).value));

    setLoading(true);
    setErrorMsg("");

    const finalBarcode = barcode.trim()
      ? barcode.trim().length < 8
        ? barcode.trim().padStart(8, "0")
        : barcode.trim()
      : Math.floor(10000000 + Math.random() * 90000000).toString();

    // Note: tax_rate and tax_type DB columns are intentionally omitted (Tax is always 0)
    const payload = {
      name: name.trim(),
      barcode: finalBarcode,
      category,
      stock: parsedStock,
      price: roundMoney(parsedPrice.value),
      cost_price: roundMoney(trueLandedCost),
      image_color: "bg-gray-100",
      image_url: imageUrl || null,
      unit,
      product_type: productType,
      brand: brand.trim() || null,
      description: description.trim() || null,
      warranty: hasWarranty && warranty.trim() ? warranty.trim() : null,
      funding_source: fundingSource,
      investor_id: fundingSource === "Investor" ? investorId || null : null,
    };

    let productData = null;

    if (productToEdit) {
      const { data, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", productToEdit.id)
        .select()
        .single();
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
      productData = data;
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert([payload])
        .select()
        .single();
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
      productData = data;
    }

    // Sync Variants
    if (productData?.id) {
      if (productToEdit) {
        await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", productData.id);
      }

      const validVariants =
        productType === "Variable Product"
          ? variants.filter(
              (v) => v.variant_name.trim() !== "" || v.variant_value.trim() !== ""
            )
          : [];

      if (validVariants.length > 0) {
        const variantInserts = validVariants.map((v) => {
          const parsedVarPrice = parseNumericInput(v.price);
          return {
            product_id: productData.id,
            image_url: v.image_url || null,
            variant_name: v.variant_name.trim() || "Size",
            variant_value: v.variant_value.trim(),
            sku: v.sku.trim() || null,
            price:
              !parsedVarPrice.isEmpty && parsedVarPrice.isValid && parsedVarPrice.value > 0
                ? roundMoney(parsedVarPrice.value)
                : null,
            stock_multiplier: v.stock_multiplier || 1,
          };
        });
        const { error: variantError } = await supabase
          .from("product_variants")
          .insert(variantInserts);
        if (variantError) {
          console.error("Variant insert error:", variantError);
        }
      }
    }

    // Log initial stock intake record on new product creation,
    // or sync existing purchase_orders when editing a product's buying cost/stock
    if (!productToEdit && parsedStock > 0) {
      const totalCost = calculateLineTotal(trueLandedCost, parsedStock);
      await supabase.from("purchase_orders").insert([
        {
          product_id: productData?.id || null,
          product_name: name.trim(),
          supplier_name: supplierName.trim() || "Direct Intake",
          quantity: parsedStock,
          remaining_quantity: parsedStock,
          cost_cny: costCurrency === "CNY" ? roundMoney(numericCostCNY) : 0,
          cost_bdt: costBDT,
          shipping_bdt: roundMoney(numericShippingBDT),
          total_cost: totalCost,
          selling_price: roundMoney(parsedPrice.value),
          payment_method: purchasePaymentMethod,
          received_by: "Store Manager",
          status: "Received",
        },
      ]);
    } else if (productToEdit && productData?.id) {
      const { data: existingPOs } = await supabase
        .from("purchase_orders")
        .select("id, quantity")
        .eq("product_id", productData.id)
        .order("created_at", { ascending: true });

      if (!existingPOs || existingPOs.length === 0) {
        if (parsedStock > 0) {
          await supabase.from("purchase_orders").insert([
            {
              product_id: productData.id,
              product_name: name.trim(),
              supplier_name: "Direct Intake",
              quantity: parsedStock,
              remaining_quantity: parsedStock,
              cost_cny: costCurrency === "CNY" ? roundMoney(numericCostCNY) : 0,
              cost_bdt: costBDT,
              shipping_bdt: roundMoney(numericShippingBDT),
              total_cost: calculateLineTotal(trueLandedCost, parsedStock),
              selling_price: roundMoney(parsedPrice.value),
              payment_method: "Cash",
              received_by: "Store Manager",
              status: "Received",
            },
          ]);
        }
      } else if (existingPOs.length === 1) {
        // Single batch for this product: keep it aligned with the edited product cost & stock
        await supabase
          .from("purchase_orders")
          .update({
            product_name: name.trim(),
            quantity: parsedStock,
            remaining_quantity: parsedStock,
            cost_bdt: roundMoney(trueLandedCost),
            total_cost: calculateLineTotal(trueLandedCost, parsedStock),
            selling_price: roundMoney(parsedPrice.value),
          })
          .eq("id", existingPOs[0].id);
      } else {
        // Multiple batches: update each batch's unit cost & name to match the corrected buying price
        for (const po of existingPOs) {
          const poQty = Math.max(0, Number(po.quantity) || 0);
          await supabase
            .from("purchase_orders")
            .update({
              product_name: name.trim(),
              cost_bdt: roundMoney(trueLandedCost),
              total_cost: calculateLineTotal(trueLandedCost, poQty),
              selling_price: roundMoney(parsedPrice.value),
            })
            .eq("id", po.id);
        }
      }
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {productToEdit ? "Edit Product" : "Add New Product"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium shrink-0">
            {errorMsg}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 flex flex-col lg:flex-row gap-6 lg:gap-8 overflow-y-auto flex-1">
          {/* Left Column: Details */}
          <div className="flex-1 space-y-5 min-w-0">
            {/* Image Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Image
              </label>
              <label className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer relative overflow-hidden h-40">
                <input
                  type="file"
                  className="hidden"
                  accept="image/png, image/jpeg"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
                {uploadingImage ? (
                  <p className="text-sm font-medium text-blue-600 animate-pulse">
                    {aiProcessing ? "Enhancing image..." : "Uploading..."}
                  </p>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-contain bg-gray-50"
                  />
                ) : (
                  <>
                    <CloudUpload className="w-8 h-8 text-blue-500 mb-2" />
                    <p className="text-sm font-medium text-gray-700">
                      Tap or drag to upload photo
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Supports JPG, PNG (Max 5MB)
                    </p>
                  </>
                )}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useAI"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                />
                <label
                  htmlFor="useAI"
                  className="text-xs font-semibold text-gray-600 cursor-pointer"
                >
                  Enhance image with AI (Removes background)
                </label>
              </div>
              {imageUrl && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleAnalyzeImage}
                    disabled={analyzingImage}
                    className="w-full min-h-[44px] py-2.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-xl text-sm font-semibold hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {analyzingImage
                      ? "Analyzing..."
                      : "Auto-fill product details with AI"}
                  </button>
                </div>
              )}
            </div>

            {/* Product Type & Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Product Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  <option value="Single Product">Single Product</option>
                  <option value="Variable Product">
                    Variable Product (Sizes / Colors)
                  </option>
                </select>
              </div>
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Product Unit
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newUnit = window.prompt("Enter new unit name:");
                      if (newUnit && newUnit.trim() !== "") {
                        const unitName = newUnit.trim();
                        if (!units.includes(unitName)) {
                          setUnits((prev) => [...prev, unitName]);
                        }
                        setUnit(unitName);
                      }
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    + Add new
                  </button>
                </div>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Classic Leather Loafer"
                className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            {/* Barcode, Category & Stock Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Barcode / SKU
                </label>
                <div className="flex relative">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan or enter SKU"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  <div className="absolute inset-y-0 right-1 flex items-center">
                    <button
                      type="button"
                      onClick={() =>
                        setBarcode(
                          Math.floor(10000000 + Math.random() * 90000000).toString()
                        )
                      }
                      title="Auto-generate 8-digit barcode"
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-[#f3f0ea] rounded-lg text-gray-700 hover:bg-gray-200"
                    >
                      <ScanBarcode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Hidden Barcode for Printing */}
                <div className="hidden">
                  <div
                    ref={barcodePrintRef}
                    className="flex flex-col items-center justify-between p-2 bg-white w-[384px] h-[160px]"
                    style={{ pageBreakInside: "avoid" }}
                  >
                    <div className="text-center w-full mb-1">
                      <h2
                        className="font-black italic text-3xl font-sans tracking-tighter text-black m-0"
                        style={{ fontFamily: "'Arial Black', Impact, sans-serif" }}
                      >
                        RIZQ
                      </h2>
                    </div>
                    <div className="flex justify-center w-full">
                      {barcode ? (
                        <Barcode
                          value={
                            barcode.length < 8
                              ? barcode.padStart(8, "0")
                              : barcode
                          }
                          width={1.8}
                          height={55}
                          fontSize={14}
                          margin={0}
                          displayValue={true}
                        />
                      ) : null}
                    </div>
                    <div className="flex justify-between items-end w-full mt-2 px-1">
                      <div className="text-left w-[65%]">
                        <p className="text-sm font-bold text-black leading-tight line-clamp-2">
                          {name || "Product Name"}
                        </p>
                      </div>
                      <div className="text-right w-[35%]">
                        <p className="text-xl font-bold text-black m-0">
                          ৳ {numericSellingPriceBDT.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Category
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newCat = window.prompt("Enter new category name:");
                      if (newCat && newCat.trim() !== "") {
                        const catName = newCat.trim();
                        if (!categories.includes(catName)) {
                          setCategories((prev) => [...prev, catName]);
                        }
                        setCategory(catName);
                      }
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    + Add new
                  </button>
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Stock Quantity
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={stock}
                  onChange={(e) =>
                    setStock(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="0"
                  className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>

            {/* Purchase / Supplier Info */}
            {!productToEdit && (
              <div className="border-t border-gray-100 pt-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Purchase Info (Initial Stock Intake)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Optional supplier name"
                      className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Payment Method
                    </label>
                    <select
                      value={purchasePaymentMethod}
                      onChange={(e) =>
                        setPurchasePaymentMethod(
                          e.target.value as "Cash" | "Card" | "Mobile Banking"
                        )
                      }
                      className="w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Mobile Banking">Mobile Banking</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Variants Section (Only visible if Variable Product) */}
            {productType === "Variable Product" && (
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                    <span className="bg-orange-100 text-orange-500 p-1.5 rounded-lg">
                      <LayoutGrid className="w-4 h-4" />
                    </span>
                    Shoe Sizes / Variants
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setVariants([
                        ...variants,
                        {
                          image_url: "",
                          variant_name: "Size",
                          variant_value: "",
                          sku: "",
                          price: "",
                        },
                      ])
                    }
                    className="min-h-[44px] bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors"
                  >
                    + Add Variant
                  </button>
                </div>

                {variants.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 bg-gray-50 rounded-xl text-sm">
                    No variants added yet. Tap &ldquo;+ Add Variant&rdquo; to add shoe sizes or colors.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variants.map((variant, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-xl grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-end"
                      >
                        <div className="col-span-1 sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                            Option
                          </label>
                          <input
                            type="text"
                            value={variant.variant_name}
                            onChange={(e) => {
                              const next = [...variants];
                              next[index].variant_name = e.target.value;
                              setVariants(next);
                            }}
                            placeholder="Size / Color"
                            className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                            Value
                          </label>
                          <input
                            type="text"
                            value={variant.variant_value}
                            onChange={(e) => {
                              const next = [...variants];
                              next[index].variant_value = e.target.value;
                              setVariants(next);
                            }}
                            placeholder="e.g. 42 / Black"
                            className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                            Price Override (৳)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={variant.price}
                            onChange={(e) => {
                              const next = [...variants];
                              next[index].price = e.target.value;
                              setVariants(next);
                            }}
                            placeholder="Default"
                            className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                            SKU
                          </label>
                          <input
                            type="text"
                            value={variant.sku}
                            onChange={(e) => {
                              const next = [...variants];
                              next[index].sku = e.target.value;
                              setVariants(next);
                            }}
                            placeholder="SKU"
                            className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...variants];
                              next.splice(index, 1);
                              setVariants(next);
                            }}
                            aria-label="Remove variant"
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Product Optional Information */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                <span className="bg-orange-100 text-orange-500 p-1.5 rounded-lg">
                  <LayoutGrid className="w-4 h-4" />
                </span>
                Additional Details
              </h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Brand
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g., Rizq"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Material, sole type, or care notes"
                  className="w-full px-3.5 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="flex items-center gap-2 font-semibold text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasWarranty}
                    onChange={(e) => setHasWarranty(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  Include Warranty
                </label>
                {hasWarranty && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Warranty Period
                    </label>
                    <input
                      type="text"
                      value={warranty}
                      onChange={(e) => setWarranty(e.target.value)}
                      placeholder="e.g. 6 Months Sole Warranty"
                      className="w-full min-h-[44px] px-3.5 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                )}
              </div>

              {/* Funding Source */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Funded By
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFundingSource("Me")}
                    className={`flex-1 min-h-[44px] py-2 text-sm font-semibold rounded-xl transition-colors ${
                      fundingSource === "Me"
                        ? "bg-gray-900 text-white"
                        : "bg-white border border-gray-200 text-gray-700"
                    }`}
                  >
                    Store (Self)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundingSource("Investor")}
                    className={`flex-1 min-h-[44px] py-2 text-sm font-semibold rounded-xl transition-colors ${
                      fundingSource === "Investor"
                        ? "bg-gray-900 text-white"
                        : "bg-white border border-gray-200 text-gray-700"
                    }`}
                  >
                    Investor
                  </button>
                </div>
                {fundingSource === "Investor" && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Select Investor
                    </label>
                    <select
                      value={investorId}
                      onChange={(e) => setInvestorId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    >
                      <option value="" disabled>
                        Select an investor...
                      </option>
                      {investors.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Pricing & Profitability */}
          <div className="w-full lg:w-[340px] bg-[#f8f6f0] rounded-2xl p-5 sm:p-6 border border-gray-100 flex flex-col shrink-0">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900">Pricing</h3>
              <div className="flex bg-gray-200 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCostCurrency("BDT")}
                  className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    costCurrency === "BDT"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  BDT ৳
                </button>
                <button
                  type="button"
                  onClick={() => setCostCurrency("CNY")}
                  className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    costCurrency === "CNY"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  CNY ¥
                </button>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              {costCurrency === "CNY" ? (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Bank Exchange Rate (BDT/CNY)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={bankRate}
                      onChange={(e) => setBankRate(e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Cost Price (CNY ¥)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">
                          ¥
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={costCNY}
                        onChange={(e) => setCostCNY(e.target.value)}
                        placeholder="0.00"
                        className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                      Cost in BDT (@ {numericBankRate})
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">
                          ৳
                        </span>
                      </div>
                      <input
                        type="text"
                        value={costBDT.toFixed(2)}
                        readOnly
                        className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-gray-100/70 text-gray-900 border border-gray-200 rounded-xl text-sm font-medium cursor-not-allowed"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Cost Price (BDT ৳)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400 text-sm font-medium">
                        ৳
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={directCostBDT}
                      onChange={(e) => setDirectCostBDT(e.target.value)}
                      placeholder="0.00"
                      className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>
                </div>
              )}

              {/* Shipping Charge */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Shipping / Per-Unit Overhead (৳)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={shippingBDT}
                    onChange={(e) => setShippingBDT(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              </div>

              {/* True Landed Cost */}
              <div className="flex justify-between items-center py-3 border-y border-gray-200/60">
                <span className="text-sm font-semibold text-gray-700">
                  True Landed Cost
                </span>
                <span className="text-lg font-bold text-gray-900">
                  ৳ {trueLandedCost.toFixed(2)}
                </span>
              </div>

              {/* Selling Price */}
              <div>
                <div className="flex flex-wrap justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Selling Price (৳) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-500">
                      Margin:
                    </span>
                    <div className="relative w-20">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="20"
                        value={targetMargin}
                        onChange={(e) => setTargetMargin(e.target.value)}
                        className="w-full pl-2 pr-5 py-1 bg-white text-gray-900 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                      <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-xs font-medium">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sellingPriceBDT}
                    onChange={(e) => {
                      setSellingPriceBDT(e.target.value);
                      setTargetMargin("");
                    }}
                    placeholder="0.00"
                    className="w-full min-h-[44px] pl-8 pr-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>

                {/* Expected Profit Card */}
                <div className="mt-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Expected Profit
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        expectedProfit >= 0
                          ? "bg-green-50 text-green-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      ~ {profitMargin.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-black text-gray-900">
                      ৳ {expectedProfit.toFixed(2)}
                    </span>
                    <span className="text-xs font-medium text-gray-400 ml-1">
                      / {unit.toLowerCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="min-h-[44px] px-6 py-2.5 bg-black text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors shadow-md disabled:opacity-50"
          >
            {loading
              ? "Saving..."
              : productToEdit
              ? "Save Changes"
              : "+ Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

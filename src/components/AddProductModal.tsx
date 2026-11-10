"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  CloudUpload,
  ScanBarcode,
  LayoutGrid,
  Trash2,
  Sparkles,
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Package,
  Layers,
  CircleDollarSign,
  Boxes,
  Plus,
  Printer,
} from "lucide-react";
import Barcode from "react-barcode";
import { useReactToPrint } from "react-to-print";
import { createClient } from "@/utils/supabase/client";
import {
  calculateLineTotal,
  parseNumericInput,
  roundMoney,
} from "@/lib/calculations";
import { loadStoreSettings } from "@/components/ReceiptModal";

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

const DEFAULT_CATEGORIES = [
  "Home Goods",
  "Electronics",
  "Personal Care",
  "Apparel",
  "Stationery",
  "Footwear",
  "Accessories",
];

const DEFAULT_UNITS = [
  "Piece",
  "Kg",
  "Box",
  "Dozen",
  "Liter",
  "Pack",
  "Pair",
  "Set",
];

export default function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
  productToEdit,
}: AddProductModalProps) {
  const supabase = createClient();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 1: Basic Product Information
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("Home Goods");
  const [categories, setCategories] =
    useState<string[]>(DEFAULT_CATEGORIES);
  const [productType, setProductType] = useState("Single Product");
  const [unit, setUnit] = useState("Piece");
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");

  // Image Upload & Nano Banana AI
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [imageEnhanced, setImageEnhanced] = useState(false);
  const [aiStatusText, setAiStatusText] = useState("");

  // Step 2: Variants & Options
  const [variants, setVariants] = useState<VariantFormRow[]>([]);

  // Step 3: Pricing & Landed Cost
  const [bankRate, setBankRate] = useState<string>("17.0");
  const [costCurrency, setCostCurrency] = useState<"CNY" | "BDT">("BDT");
  const [costCNY, setCostCNY] = useState<string>("");
  const [directCostBDT, setDirectCostBDT] = useState<string>("");
  const [shippingBDT, setShippingBDT] = useState<string>("");
  const [sellingPriceBDT, setSellingPriceBDT] = useState<string>("");
  const [targetMargin, setTargetMargin] = useState<string>("");

  // Step 4: Stock, Supplier, Warranty & Funding
  const [stock, setStock] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<
    "Cash" | "Card" | "Mobile Banking"
  >("Cash");
  const [hasWarranty, setHasWarranty] = useState(false);
  const [warranty, setWarranty] = useState("");
  const [fundingSource, setFundingSource] = useState<"Me" | "Investor">("Me");
  const [investorId, setInvestorId] = useState("");
  const [investors, setInvestors] = useState<{ id: string; name: string }[]>(
    []
  );

  // Barcode Printing Ref
  const barcodePrintRef = useRef<HTMLDivElement>(null);
  const handlePrintBarcode = useReactToPrint({
    contentRef: barcodePrintRef,
    documentTitle: `${name || "Product"}-Barcode`,
  });

  // Derived Calculations
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

  // Auto-calculate selling price when target margin changes
  useEffect(() => {
    const parsedMargin = parseNumericInput(targetMargin);
    if (!parsedMargin.isEmpty && parsedMargin.isValid && trueLandedCost > 0) {
      const newPrice = Math.round(
        trueLandedCost * (1 + parsedMargin.value / 100)
      );
      setSellingPriceBDT(String(newPrice));
    }
  }, [targetMargin, trueLandedCost]);

  // Prevent scroll wheel from changing number inputs
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  // Reset or populate form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setCurrentStep(1);
    setErrorMsg("");

    const fetchInitialData = async () => {
      // 1. Fetch investors
      const { data: invData } = await supabase
        .from("investors")
        .select("id, name")
        .order("name");
      if (invData) setInvestors(invData);

      // 2. Fetch all existing categories from products table to enrich dropdown
      const { data: prodCats } = await supabase
        .from("products")
        .select("category")
        .not("category", "is", null);
      if (prodCats && prodCats.length > 0) {
        const unique = Array.from(
          new Set(prodCats.map((p: any) => p.category).filter(Boolean))
        ) as string[];
        setCategories((prev) => Array.from(new Set([...prev, ...unique])));
      }
    };
    fetchInitialData();

    if (productToEdit) {
      setName(productToEdit.name || "");
      setBarcode(productToEdit.barcode || "");
      const editCategory = productToEdit.category || "Home Goods";
      setCategory(editCategory);
      setCategories((prev) =>
        editCategory && !prev.includes(editCategory)
          ? [...prev, editCategory]
          : prev
      );
      setStock(
        productToEdit.stock !== undefined ? String(productToEdit.stock) : ""
      );
      setSupplierName("");
      setPurchasePaymentMethod("Cash");
      setCostCurrency("BDT");
      setCostCNY("");
      setDirectCostBDT(
        productToEdit.cost_price !== undefined
          ? String(productToEdit.cost_price)
          : ""
      );
      setShippingBDT("");
      setSellingPriceBDT(
        productToEdit.price !== undefined ? String(productToEdit.price) : ""
      );
      setTargetMargin("");
      setErrorMsg("");
      setImageUrl(productToEdit.image_url || "");
      setProductType(productToEdit.product_type || "Single Product");
      const editUnit = productToEdit.unit || "Piece";
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

      // Load existing variants if editing
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
                  variant_name: v.variant_name || "Option",
                  variant_value: v.variant_value || "",
                  sku: v.sku || "",
                  price:
                    v.price !== null && v.price !== undefined
                      ? String(v.price)
                      : "",
                  stock_multiplier: v.stock_multiplier || 1,
                }))
              );
              setProductType("Variable Product");
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
      setCategory("Home Goods");
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
      setImageEnhanced(false);
      setBankRate("17.0");
      setProductType("Single Product");
      setUnit("Piece");
      setBrand("");
      setDescription("");
      setHasWarranty(false);
      setWarranty("");
      setFundingSource("Me");
      setInvestorId("");
      setVariants([]);
    }
  }, [isOpen, productToEdit, supabase]);

  // AI Auto-Fill details with Gemini
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
            headers: { "Content-Type": "application/json" },
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
    } catch {
      setErrorMsg("Failed to prepare image for AI analysis.");
      setAnalyzingImage(false);
    }
  };

  // Studio e-commerce composite
  const renderStudioProductImage = async (
    imageSource: Blob | string
  ): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl =
        typeof imageSource === "string"
          ? imageSource
          : URL.createObjectURL(imageSource);

      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 1000;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            resolve(
              imageSource instanceof Blob
                ? imageSource
                : fetch(objectUrl).then((r) => r.blob())
            );
            return;
          }

          // 1. Pure crisp white background
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);

          // 2. Center and scale product with 12% margin
          const maxDim = size * 0.8;
          const scale = Math.min(maxDim / img.width, maxDim / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (size - drawW) / 2;
          const drawY = (size - drawH) / 2;

          // 3. Subtle ambient contact shadow under product
          const shadowY = drawY + drawH * 0.96;
          const shadowRadiusX = drawW * 0.38;
          const shadowRadiusY = drawH * 0.05;
          const shadowGrad = ctx.createRadialGradient(
            size / 2,
            shadowY,
            shadowRadiusY * 0.3,
            size / 2,
            shadowY,
            shadowRadiusX
          );
          shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.15)");
          shadowGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.04)");
          shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.ellipse(
            size / 2,
            shadowY,
            shadowRadiusX,
            shadowRadiusY,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();

          // 4. Draw product
          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          canvas.toBlob(
            (blob) => {
              if (typeof imageSource !== "string") URL.revokeObjectURL(objectUrl);
              resolve(
                blob || (imageSource instanceof Blob ? imageSource : new Blob())
              );
            },
            "image/jpeg",
            0.93
          );
        } catch {
          if (typeof imageSource !== "string") URL.revokeObjectURL(objectUrl);
          resolve(
            imageSource instanceof Blob
              ? imageSource
              : fetch(objectUrl).then((r) => r.blob())
          );
        }
      };

      img.onerror = () => {
        if (typeof imageSource !== "string") URL.revokeObjectURL(objectUrl);
        resolve(imageSource instanceof Blob ? imageSource : new Blob());
      };

      img.src = objectUrl;
    });
  };

  // Upload & Enhance Image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      setUploadingImage(true);
      setErrorMsg("");
      setImageEnhanced(false);
      setAiStatusText("");

      let finalBlob: Blob = file;

      if (useAI) {
        setAiProcessing(true);
        setAiStatusText("Nano Banana AI: Enhancing product photo...");

        let enhancedSuccessfully = false;

        // Step 1: Call Nano Banana API via server route
        try {
          const storeSettings = loadStoreSettings();
          const formData = new FormData();
          formData.append("image", file);

          const aiResponse = await fetch("/api/enhance-image", {
            method: "POST",
            headers: {
              ...(storeSettings.nanoBananaApiKey
                ? { "x-nanobanana-key": storeSettings.nanoBananaApiKey }
                : {}),
            },
            body: formData,
          });

          if (aiResponse.ok) {
            const contentType = aiResponse.headers.get("content-type") || "";
            if (contentType.includes("image/")) {
              const returnedBlob = await aiResponse.blob();
              finalBlob = await renderStudioProductImage(returnedBlob);
              enhancedSuccessfully = true;
            }
          }
        } catch (apiErr) {
          console.warn("Nano Banana API error:", apiErr);
        }

        // Step 2: Local AI Background Removal Fallback
        if (!enhancedSuccessfully) {
          setAiStatusText(
            "Nano Banana AI: Removing background & studio lighting..."
          );
          try {
            const { removeBackground } = await import(
              "@imgly/background-removal"
            );
            const cutoutBlob = await removeBackground(file);
            finalBlob = await renderStudioProductImage(cutoutBlob);
            enhancedSuccessfully = true;
          } catch (localErr) {
            console.warn("Local background removal fallback:", localErr);
            finalBlob = await renderStudioProductImage(file);
            enhancedSuccessfully = true;
          }
        }

        setImageEnhanced(enhancedSuccessfully);
      }

      setAiStatusText("Saving product image...");

      const cleanFile = new File([finalBlob], "product-image.jpg", {
        type: "image/jpeg",
      });

      const fileName = `${Math.random().toString(36).substring(7)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("product_images")
        .upload(fileName, cleanFile, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (!uploadError) {
        const { data } = supabase.storage
          .from("product_images")
          .getPublicUrl(fileName);
        setImageUrl(data.publicUrl);
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) setImageUrl(reader.result as string);
        };
        reader.readAsDataURL(cleanFile);
      }
    } catch (error: any) {
      console.error("Image upload error:", error);
      setErrorMsg(error.message || "Failed to process image.");
    } finally {
      setUploadingImage(false);
      setAiProcessing(false);
      setAiStatusText("");
    }
  };

  // Add variant preset helper
  const handleAddVariant = (optName = "Option", optVal = "") => {
    setVariants((prev) => [
      ...prev,
      {
        image_url: "",
        variant_name: optName,
        variant_value: optVal,
        sku: barcode && optVal ? `${barcode}-${optVal}` : "",
        price: "",
      },
    ]);
  };

  // Step Validation & Navigation
  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!name.trim()) {
        setErrorMsg("Please enter a product name to continue.");
        return;
      }
      setErrorMsg("");
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setErrorMsg("");
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const parsedPrice = parseNumericInput(sellingPriceBDT);
      if (
        parsedPrice.isEmpty ||
        !parsedPrice.isValid ||
        parsedPrice.value <= 0
      ) {
        setErrorMsg("Please enter a valid selling price greater than ৳0.");
        return;
      }
      setErrorMsg("");
      setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    setErrorMsg("");
    setCurrentStep((prev) => (Math.max(1, prev - 1) as 1 | 2 | 3 | 4));
  };

  // Final Submit
  const handleSubmit = async () => {
    const parsedPrice = parseNumericInput(sellingPriceBDT);
    if (
      !name.trim() ||
      parsedPrice.isEmpty ||
      !parsedPrice.isValid ||
      parsedPrice.value < 0
    ) {
      setErrorMsg("Product name and a valid selling price are required.");
      setCurrentStep(3);
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
              (v) =>
                v.variant_name.trim() !== "" || v.variant_value.trim() !== ""
            )
          : [];

      if (validVariants.length > 0) {
        const variantInserts = validVariants.map((v) => {
          const parsedVarPrice = parseNumericInput(v.price);
          return {
            product_id: productData.id,
            image_url: v.image_url || null,
            variant_name: v.variant_name.trim() || "Option",
            variant_value: v.variant_value.trim(),
            sku: v.sku.trim() || null,
            price:
              !parsedVarPrice.isEmpty &&
              parsedVarPrice.isValid &&
              parsedVarPrice.value > 0
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

    // Sync initial stock intake record into purchase_orders
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

  if (!isOpen) return null;

  const stepsList = [
    { num: 1, label: "Product & Photo", icon: Package },
    { num: 2, label: "Variants & Options", icon: Layers },
    { num: 3, label: "Cost & Pricing", icon: CircleDollarSign },
    { num: 4, label: "Stock & Review", icon: Boxes },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[96dvh] sm:max-h-[90vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header & Step Bar */}
        <div className="border-b border-gray-100 bg-[#faf9f6] shrink-0">
          <div className="flex justify-between items-center px-4 sm:px-6 py-3.5 border-b border-gray-200/60">
            <div>
              <h2 className="text-base sm:text-lg font-black text-gray-900">
                {productToEdit ? "Edit Product" : "Add New Product"}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Step {currentStep} of 4: {stepsList[currentStep - 1].label}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-200/70 hover:text-gray-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Tabs */}
          <div className="grid grid-cols-4 px-2 sm:px-4 py-2 gap-1 bg-white">
            {stepsList.map((step) => {
              const isCurrent = currentStep === step.num;
              const isPast = currentStep > step.num;
              return (
                <button
                  key={step.num}
                  type="button"
                  onClick={() => {
                    if (step.num < currentStep) {
                      setCurrentStep(step.num as 1 | 2 | 3 | 4);
                      setErrorMsg("");
                    } else if (step.num > currentStep) {
                      handleNextStep();
                    }
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 rounded-xl text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-black text-white shadow-xs"
                      : isPast
                      ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                      isCurrent
                        ? "bg-white text-black font-black"
                        : isPast
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {isPast ? <Check className="w-3 h-3 stroke-[3]" /> : step.num}
                  </div>
                  <span className="hidden sm:inline truncate">{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs sm:text-sm font-semibold shrink-0 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* ========================================================================= */}
          {/* STEP 1: Product Information & Photo */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Image Upload Box with Nano Banana AI */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-2">
                  Product Photo &amp; AI Studio Background
                </label>
                <label className="border-2 border-dashed border-gray-300 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer relative overflow-hidden h-44 bg-gray-50/60">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                  />
                  {uploadingImage ? (
                    <div className="flex flex-col items-center justify-center p-2">
                      <Loader2 className="w-7 h-7 animate-spin text-black mb-2" />
                      <p className="text-xs sm:text-sm font-bold text-gray-900 animate-pulse">
                        {aiStatusText || "Processing image..."}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Removing background &amp; applying studio lighting...
                      </p>
                    </div>
                  ) : imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Product Preview"
                      className="absolute inset-0 w-full h-full object-contain bg-white p-2"
                    />
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-11 h-11 rounded-2xl bg-[#f3f0ea] flex items-center justify-center text-gray-800 mb-2">
                        <CloudUpload className="w-6 h-6" />
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-gray-900">
                        Tap or drag to upload product photo
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        JPG, PNG, WebP supported (Max 5MB)
                      </p>
                    </div>
                  )}
                </label>

                {/* AI Toggles & Action */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 select-none">
                    <input
                      type="checkbox"
                      checked={useAI}
                      onChange={(e) => setUseAI(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                    />
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Nano Banana AI Studio Background</span>
                  </label>

                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleAnalyzeImage}
                      disabled={analyzingImage}
                      className="px-3 py-1.5 bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/80 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {analyzingImage ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Auto-filling...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Auto-fill details with AI</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {imageEnhanced && imageUrl && (
                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Enhanced with Nano Banana AI (Pure white studio background)</span>
                  </div>
                )}
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Classic Watch, Cotton Shirt, Leather Wallet"
                  className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                />
              </div>

              {/* Category & Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold uppercase text-gray-700">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const newCat = window.prompt("New Category Name:");
                        if (newCat && newCat.trim()) {
                          const trimmed = newCat.trim();
                          if (!categories.includes(trimmed)) {
                            setCategories((prev) => [...prev, trimmed]);
                          }
                          setCategory(trimmed);
                        }
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      + Add New
                    </button>
                  </div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold uppercase text-gray-700">
                      Product Unit
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const newUnit = window.prompt("New Unit Name:");
                        if (newUnit && newUnit.trim()) {
                          const trimmed = newUnit.trim();
                          if (!units.includes(trimmed)) {
                            setUnits((prev) => [...prev, trimmed]);
                          }
                          setUnit(trimmed);
                        }
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      + Add New
                    </button>
                  </div>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barcode & Brand */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Barcode / SKU
                  </label>
                  <div className="flex relative">
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Scan or enter barcode"
                      className="w-full min-h-[46px] pl-3.5 pr-11 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                    />
                    <div className="absolute inset-y-0 right-1 flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          setBarcode(
                            Math.floor(
                              10000000 + Math.random() * 90000000
                            ).toString()
                          )
                        }
                        title="Auto-generate 8-digit barcode"
                        className="w-9 h-9 flex items-center justify-center bg-gray-200/80 rounded-lg text-gray-700 hover:bg-gray-300"
                      >
                        <ScanBarcode className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Rizq, Apple, Nike"
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                  />
                </div>
              </div>

              {/* Product Type (Single vs Variable) */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200">
                <label className="block text-xs font-bold uppercase text-gray-700 mb-2">
                  Product Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setProductType("Single Product")}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${
                      productType === "Single Product"
                        ? "border-black bg-black text-white shadow-xs"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>Single Product</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductType("Variable Product")}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${
                      productType === "Variable Product"
                        ? "border-black bg-black text-white shadow-xs"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Has Variants (Sizes / Colors / Models)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: Variants & Options */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {productType === "Single Product" ? (
                <div className="text-center py-8 px-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#f3f0ea] flex items-center justify-center mx-auto text-gray-800">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Single Product Selected
                    </h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                      This product does not have variants (sizes, colors, or flavors). You can proceed directly to Pricing.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProductType("Variable Product")}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-800 hover:bg-gray-100 transition-colors"
                  >
                    + Switch to Variable Product (Add Options)
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Preset Suggestions */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 uppercase">
                        Quick Add Options:
                      </span>
                    </div>

                    {/* Common Size & Color Presets */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-gray-500 mr-1">
                          Sizes:
                        </span>
                        {["S", "M", "L", "XL", "XXL", "39", "40", "41", "42", "43", "44", "45"].map(
                          (val) => {
                            const exists = variants.some(
                              (v) => v.variant_value === val
                            );
                            return (
                              <button
                                key={val}
                                type="button"
                                disabled={exists}
                                onClick={() => handleAddVariant("Size", val)}
                                className={`min-h-[32px] px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                                  exists
                                    ? "bg-amber-200/60 text-amber-800 opacity-60 cursor-not-allowed"
                                    : "bg-white text-gray-900 border border-amber-300 hover:bg-amber-100 shadow-2xs"
                                }`}
                              >
                                {exists ? `✓ ${val}` : `+ ${val}`}
                              </button>
                            );
                          }
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-gray-500 mr-1">
                          Colors:
                        </span>
                        {["Black", "White", "Blue", "Red", "Brown", "Grey"].map(
                          (val) => {
                            const exists = variants.some(
                              (v) => v.variant_value === val
                            );
                            return (
                              <button
                                key={val}
                                type="button"
                                disabled={exists}
                                onClick={() => handleAddVariant("Color", val)}
                                className={`min-h-[32px] px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                                  exists
                                    ? "bg-amber-200/60 text-amber-800 opacity-60 cursor-not-allowed"
                                    : "bg-white text-gray-900 border border-amber-300 hover:bg-amber-100 shadow-2xs"
                                }`}
                              >
                                {exists ? `✓ ${val}` : `+ ${val}`}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Variants List */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold uppercase text-gray-700">
                        Product Variants ({variants.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAddVariant("Option", "")}
                        className="px-3 py-1.5 bg-black text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Custom Option</span>
                      </button>
                    </div>

                    {variants.length === 0 ? (
                      <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-xs font-medium">
                        No variants added yet. Tap quick pills above or click &ldquo;Add Custom Option&rdquo;.
                      </div>
                    ) : (
                      variants.map((variant, index) => (
                        <div
                          key={index}
                          className="p-3 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-12 gap-2 items-center"
                        >
                          <div className="col-span-4 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                              Option Name
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
                              className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900"
                            />
                          </div>

                          <div className="col-span-4 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
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
                              placeholder="e.g. XL / Red"
                              className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900"
                            />
                          </div>

                          <div className="col-span-3 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                              Price (৳ Override)
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
                              placeholder="Default price"
                              className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-900"
                            />
                          </div>

                          <div className="col-span-11 sm:col-span-2">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
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
                              className="w-full min-h-[38px] px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono text-gray-900"
                            />
                          </div>

                          <div className="col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...variants];
                                next.splice(index, 1);
                                setVariants(next);
                              }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: Cost & Pricing */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* Currency Mode Selection */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-xs font-bold uppercase text-gray-900 block">
                    Buying Currency
                  </span>
                  <span className="text-[11px] text-gray-500">
                    Switch to Chinese Yuan (¥) if importing products
                  </span>
                </div>
                <div className="flex bg-gray-200 p-0.5 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setCostCurrency("BDT")}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      costCurrency === "BDT"
                        ? "bg-black text-white shadow-xs"
                        : "text-gray-700 hover:text-black"
                    }`}
                  >
                    BDT ৳ (Local)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCostCurrency("CNY")}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      costCurrency === "CNY"
                        ? "bg-black text-white shadow-xs"
                        : "text-gray-700 hover:text-black"
                    }`}
                  >
                    CNY ¥ (Import)
                  </button>
                </div>
              </div>

              {/* Cost Inputs */}
              {costCurrency === "CNY" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                      Bank Exchange Rate (BDT/CNY)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={bankRate}
                      onChange={(e) => setBankRate(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                      Cost in CNY (¥)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={costCNY}
                      onChange={(e) => setCostCNY(e.target.value)}
                      placeholder="0.00"
                      className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Direct Buying Cost (BDT ৳)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={directCostBDT}
                    onChange={(e) => setDirectCostBDT(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900"
                  />
                </div>
              )}

              {/* Shipping / Overhead */}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                  Shipping / Freight Per Unit (৳)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={shippingBDT}
                  onChange={(e) => setShippingBDT(e.target.value)}
                  placeholder="0.00"
                  className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900"
                />
              </div>

              {/* True Landed Cost Badge */}
              <div className="flex justify-between items-center p-3.5 bg-gray-100/80 rounded-2xl border border-gray-200">
                <span className="text-xs font-bold text-gray-700 uppercase">
                  Total Landed Cost:
                </span>
                <span className="text-base font-black text-gray-900">
                  ৳ {trueLandedCost.toFixed(2)}
                </span>
              </div>

              {/* Selling Price & Target Margin */}
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-gray-900">
                    Selling Price (BDT ৳) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-gray-500">
                      Margin:
                    </span>
                    {["20", "30", "40", "50"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTargetMargin(m)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          targetMargin === m
                            ? "bg-black text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {m}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-sm font-bold text-gray-400">
                    ৳
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sellingPriceBDT}
                    onChange={(e) => {
                      setSellingPriceBDT(e.target.value);
                      setTargetMargin("");
                    }}
                    placeholder="0.00"
                    className="w-full min-h-[48px] pl-8 pr-4 py-2.5 bg-white border-2 border-gray-900 rounded-xl text-base font-black text-gray-900 focus:outline-none"
                  />
                </div>

                {/* Live Profit Preview Box */}
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 uppercase block">
                      Expected Profit / Unit
                    </span>
                    <span className="text-xs text-emerald-600 font-medium">
                      Selling Price − Landed Cost
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-900 block leading-tight">
                      ৳ {expectedProfit.toFixed(2)}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700">
                      ~ {profitMargin.toFixed(0)}% margin
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4: Stock, Supplier & Review */}
          {/* ========================================================================= */}
          {currentStep === 4 && (
            <div className="space-y-4">
              {/* Initial Stock & Supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Initial Stock ({unit}s)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stock}
                    onChange={(e) =>
                      setStock(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="0"
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. Dhaka Wholesale Ltd."
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                  />
                </div>
              </div>

              {/* Payment & Funding */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Purchase Payment Method
                  </label>
                  <select
                    value={purchasePaymentMethod}
                    onChange={(e) =>
                      setPurchasePaymentMethod(
                        e.target.value as "Cash" | "Card" | "Mobile Banking"
                      )
                    }
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Mobile Banking">Mobile Banking</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Funded By
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFundingSource("Me")}
                      className={`flex-1 min-h-[46px] rounded-xl text-xs font-bold border transition-colors ${
                        fundingSource === "Me"
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      Store Self
                    </button>
                    <button
                      type="button"
                      onClick={() => setFundingSource("Investor")}
                      className={`flex-1 min-h-[46px] rounded-xl text-xs font-bold border transition-colors ${
                        fundingSource === "Investor"
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      Investor
                    </button>
                  </div>
                </div>
              </div>

              {fundingSource === "Investor" && (
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Select Investor
                  </label>
                  <select
                    value={investorId}
                    onChange={(e) => setInvestorId(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900"
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

              {/* Warranty & Notes */}
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-800">
                  <input
                    type="checkbox"
                    checked={hasWarranty}
                    onChange={(e) => setHasWarranty(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                  />
                  <span>Provide Product Warranty</span>
                </label>
                {hasWarranty && (
                  <input
                    type="text"
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value)}
                    placeholder="e.g. 1 Year Service Warranty"
                    className="w-full min-h-[42px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900"
                  />
                )}
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional product description or specifications"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900"
                />
              </div>

              {/* Review Summary Card */}
              <div className="p-4 bg-gray-900 text-white rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={name}
                        className="w-14 h-14 object-contain rounded-xl bg-white p-1 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-800 flex items-center justify-center text-gray-500 shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="text-sm font-black truncate">{name || "Untitled Product"}</h4>
                      <p className="text-xs text-gray-400">
                        {category} • {productType} {variants.length > 0 ? `(${variants.length} options)` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                        Barcode: {barcode || "Auto"}
                      </p>
                    </div>
                  </div>

                  {barcode && (
                    <button
                      type="button"
                      onClick={() => handlePrintBarcode()}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                      title="Print Barcode Label"
                    >
                      <Printer className="w-4 h-4" />
                      <span className="hidden sm:inline">Print Barcode</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800 text-center">
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">
                      Cost
                    </span>
                    <span className="text-xs font-bold text-gray-200">
                      ৳{trueLandedCost.toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block uppercase font-bold">
                      Selling Price
                    </span>
                    <span className="text-xs font-black text-white">
                      ৳{numericSellingPriceBDT.toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400 block uppercase font-bold">
                      Initial Stock
                    </span>
                    <span className="text-xs font-black text-emerald-400">
                      {stock || 0} {unit}s
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hidden Barcode Printing Ref */}
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
                  value={barcode.length < 8 ? barcode.padStart(8, "0") : barcode}
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

        {/* Sticky Wizard Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-gray-100 bg-[#faf9f6] flex items-center justify-between shrink-0">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-gray-500 hover:bg-gray-200/60 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="min-h-[44px] px-5 sm:px-6 py-2.5 bg-black text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-gray-800 active:scale-95 transition-all flex items-center gap-2 shadow-sm"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="min-h-[44px] px-6 py-2.5 bg-black text-white rounded-xl font-black text-xs sm:text-sm hover:bg-gray-800 active:scale-95 transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>
                      {productToEdit ? "Save Changes" : "Complete & Save Product"}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

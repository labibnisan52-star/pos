"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, CloudUpload, Image as ImageIcon, ScanBarcode, Printer, LayoutGrid, Trash2 } from "lucide-react";
import Barcode from "react-barcode";
import { useReactToPrint } from "react-to-print";
import { createClient } from "@/utils/supabase/client";
import { removeBackground } from "@imgly/background-removal";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productToEdit?: any;
}



// Helper to composite the transparent product onto a beautiful studio background
const createProfessionalStudioImage = (transparentBlob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(transparentBlob);
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get 2d context"));
        return;
      }

      // Draw studio background (light gray to white gradient)
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#f8f9fa");
      gradient.addColorStop(1, "#e9ecef");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add soft shadow below the product
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;

      // Draw the transparent product image
      ctx.drawImage(img, 0, 0);

      // Reset shadow
      ctx.shadowColor = "transparent";

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas to Blob failed"));
        }
      }, "image/jpeg", 0.95);
      
      URL.revokeObjectURL(url);
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
};

// Helper to quickly downscale large images so the UI doesn't freeze during ML
const downscaleImage = (file: File | Blob, maxWidth = 1024): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = (maxWidth * height) / width;
          width = maxWidth;
        } else {
          width = (maxWidth * width) / height;
          height = maxWidth;
        }
      } else {
        // Already small enough
        resolve(file);
        URL.revokeObjectURL(url);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        resolve(blob || file);
        URL.revokeObjectURL(url);
      }, "image/jpeg", 0.9);
    };
    img.onerror = () => {
      resolve(file);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
};


export default function AddProductModal({ isOpen, onClose, onSuccess, productToEdit }: AddProductModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("Home Goods");
  const [categories, setCategories] = useState<string[]>(["Home Goods", "Electronics", "Personal Care", "Apparel", "Stationery"]);
  const [stock, setStock] = useState<number | "">("");

  // Advanced Product Details
  const [productType, setProductType] = useState("Single Product");
  const [unit, setUnit] = useState("Piece");
  const [units, setUnits] = useState<string[]>(["Piece", "Kg", "Box", "Dozen", "Liter", "Pack"]);
  const [brand, setBrand] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxType, setTaxType] = useState("");
  const [description, setDescription] = useState("");
  const [hasWarranty, setHasWarranty] = useState(false);
  const [warranty, setWarranty] = useState("");
  
  // Variants
  const [variants, setVariants] = useState<{ image_url: string; variant_name: string; variant_value: string; sku: string; price?: number; stock_multiplier?: number; }[]>([]);

  // Barcode Printing
  const barcodePrintRef = useRef<HTMLDivElement>(null);
  const handlePrintBarcode = useReactToPrint({
    contentRef: barcodePrintRef,
    documentTitle: `Barcode-${barcode || 'Preview'}`,
  });

  // Purchase tracking
  const [supplierName, setSupplierName] = useState("");
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<"Cash" | "Card" | "Mobile Banking">("Cash");
  
  // Funding Source
  const [fundingSource, setFundingSource] = useState<"Me" | "Investor">("Me");
  const [investorId, setInvestorId] = useState("");
  const [investors, setInvestors] = useState<{ id: string; name: string }[]>([]);
  
  // Image Upload
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [useAI, setUseAI] = useState(true); // Toggle for AI processing
  const [analyzingImage, setAnalyzingImage] = useState(false);

  // Pricing
  const [bankRate, setBankRate] = useState<number>(17.0);
  const [costCurrency, setCostCurrency] = useState<"CNY" | "BDT">("CNY");
  const [costCNY, setCostCNY] = useState<number | "">("");
  const [directCostBDT, setDirectCostBDT] = useState<number | "">("");
  const [shippingBDT, setShippingBDT] = useState<number | "">("");
  const [sellingPriceBDT, setSellingPriceBDT] = useState<number | "">("");
  const [targetMargin, setTargetMargin] = useState<number | "">("");

  // Derived values
  const costBDT = costCurrency === "CNY" ? (Number(costCNY) || 0) * bankRate : (Number(directCostBDT) || 0);
  const trueLandedCost = costBDT + (Number(shippingBDT) || 0);
  const expectedProfit = (Number(sellingPriceBDT) || 0) - trueLandedCost;
  const profitMargin = trueLandedCost > 0 
    ? (expectedProfit / trueLandedCost) * 100 
    : 0;

  // Auto-calculate selling price when margin or cost changes
  useEffect(() => {
    if (targetMargin !== "" && trueLandedCost > 0) {
      const newPrice = trueLandedCost * (1 + Number(targetMargin) / 100);
      setSellingPriceBDT(Math.round(newPrice));
    }
  }, [targetMargin, trueLandedCost]);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      const fetchInvestors = async () => {
        const { data } = await supabase.from("investors").select("id, name").order("name");
        if (data) setInvestors(data);
      };
      fetchInvestors();
      if (productToEdit) {
        setName(productToEdit.name || "");
        setBarcode(productToEdit.barcode || "");
        setCategory(productToEdit.category || "Home Goods");
        setCategories(prev => {
          if (productToEdit.category && !prev.includes(productToEdit.category)) {
            return [...prev, productToEdit.category];
          }
          return prev;
        });
        setStock(productToEdit.stock || "");
        setSupplierName("");
        setPurchasePaymentMethod("Cash");
        setCostCurrency("BDT");
        setDirectCostBDT(productToEdit.cost_price || "");
        setShippingBDT("");
        setSellingPriceBDT(productToEdit.price || "");
        setTargetMargin("");
        setErrorMsg("");
        setImageUrl(productToEdit.image_url || "");
        setAiProcessing(false);
        setBankRate(17.0);
        setProductType(productToEdit.product_type || "Single Product");
        setUnit(productToEdit.unit || "Piece");
        setUnits(prev => {
          if (productToEdit.unit && !prev.includes(productToEdit.unit)) {
            return [...prev, productToEdit.unit];
          }
          return prev;
        });
        setBrand(productToEdit.brand || "");
        setTaxRate(productToEdit.tax_rate !== null ? productToEdit.tax_rate : "");
        setTaxType(productToEdit.tax_type || "");
        setDescription(productToEdit.description || "");
        setHasWarranty(!!productToEdit.warranty);
        setWarranty(productToEdit.warranty || "");
        setVariants([]);
        setFundingSource(productToEdit.funding_source || "Me");
        setInvestorId(productToEdit.investor_id || "");
      } else {
        setName("");
        setBarcode(Math.floor(10000000 + Math.random() * 90000000).toString());
      setCategory("Home Goods");
      setStock("");
      setSupplierName("");
      setPurchasePaymentMethod("Cash");
      setCostCurrency("CNY");
      setCostCNY("");
      setDirectCostBDT("");
      setShippingBDT("");
      setSellingPriceBDT("");
      setTargetMargin("");
      setErrorMsg("");
      setImageUrl("");
      setAiProcessing(false);
      setBankRate(17.0);
      setProductType("Single Product");
      setUnit("Piece");
      setBrand("");
      setTaxRate("");
      setTaxType("");
      setDescription("");
      setHasWarranty(false);
      setWarranty("");
      setVariants([]);
      setFundingSource("Me");
      setInvestorId("");
      }
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
            if (!categories.includes(catName)) {
              setCategories(prev => [...prev, catName]);
            }
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
        // Yield to let React render the loading state before potentially blocking the main thread
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
            console.warn("AI enhancement failed (likely network block or API down).", backendError);
            alert("AI enhancement could not download necessary files due to network. Using the original image instead.");
            finalBlob = file;
          }
      }

      const cleanFile = new File([finalBlob], "product-image.jpg", { type: 'image/jpeg' });
      setAiProcessing(false);

      // 2. Upload to Supabase
      const fileName = `${Math.random().toString(36).substring(7)}.jpg`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product_images')
        .upload(filePath, cleanFile, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('product_images').getPublicUrl(filePath);
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
    if (!name || !sellingPriceBDT) {
      setErrorMsg("Name and Selling Price are required.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    // Auto generate 8-digit random numeric barcode
    const finalBarcode = barcode.trim() 
      ? (barcode.trim().length < 8 ? barcode.trim().padStart(8, '0') : barcode.trim())
      : Math.floor(10000000 + Math.random() * 90000000).toString();

    // 1. Insert or Update product
    const payload = {
        name,
        barcode: finalBarcode,
        category,
        stock: Number(stock) || 0,
        price: Number(sellingPriceBDT),
        cost_price: Number(trueLandedCost),
        image_color: "bg-gray-100",
        image_url: imageUrl || null,
        unit,
        product_type: productType,
        brand: brand || null,
        tax_rate: taxRate ? Number(taxRate) : null,
        tax_type: taxType || null,
        description: description || null,
        warranty: hasWarranty && warranty ? warranty : null,
        funding_source: fundingSource,
        investor_id: fundingSource === "Investor" ? investorId || null : null
    };

    let productData = null;

    if (productToEdit) {
      const { data, error } = await supabase.from('products').update(payload).eq('id', productToEdit.id).select().single();
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
      productData = data;
    } else {
      const { data, error } = await supabase.from('products').insert([payload]).select().single();
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
      productData = data;
    }


    // 1.5 Update Variants if Variable Product
    if (productType === "Variable Product" && variants.length > 0 && productData?.id) {
      if (productToEdit) {
        await supabase.from('product_variants').delete().eq('product_id', productData.id);
      }
      const variantInserts = variants.map(v => ({
        product_id: productData.id,
        image_url: v.image_url,
        variant_name: v.variant_name,
        variant_value: v.variant_value,
        sku: v.sku,
        price: v.price || null,
        stock_multiplier: v.stock_multiplier || 1
      }));
      const { error: variantError } = await supabase.from('product_variants').insert(variantInserts);
      if (variantError) {
        console.error("Variant insert error:", variantError);
      }
    }

    // 2. Log purchase order (stock intake record) - Only on fresh insert for now
    if (!productToEdit) {
      const totalCost = trueLandedCost * (Number(stock) || 1);
      await supabase.from('purchase_orders').insert([{
        product_id: productData?.id || null,
        product_name: name,
        supplier_name: supplierName || 'Unknown',
        quantity: Number(stock) || 0,
        remaining_quantity: Number(stock) || 0,
        cost_cny: costCurrency === "CNY" ? Number(costCNY) || 0 : 0,
        cost_bdt: costBDT,
        shipping_bdt: Number(shippingBDT) || 0,
        total_cost: totalCost,
        selling_price: Number(sellingPriceBDT),
        payment_method: purchasePaymentMethod,
        received_by: 'Store Manager',
        status: 'Received'
      }]);
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">{productToEdit ? "Edit Product" : "Add New Product"}</h2>
          <div className="flex items-center gap-3">
            {errorMsg && <div className="text-red-500 text-sm font-medium mr-2">{errorMsg}</div>}
            <button 
              onClick={onClose}
              className="px-5 py-2 rounded-xl font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors shadow-md disabled:opacity-50"
            >
              {loading ? "Saving..." : (productToEdit ? "Save Changes" : "+ Add Product")}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col lg:flex-row gap-8 overflow-y-auto">
          
          {/* Left Column: Details */}
          <div className="flex-1 space-y-6">
            
            {/* Image Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Product Image</label>
              <label className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer relative overflow-hidden h-40">
                <input type="file" className="hidden" accept="image/png, image/jpeg" onChange={handleImageUpload} disabled={uploadingImage} />
                {uploadingImage ? (
                  <p className="text-sm font-medium text-blue-600 animate-pulse">
                    {aiProcessing ? "🍌 Nano Banana is enhancing..." : "Uploading..."}
                  </p>
                ) : imageUrl ? (
                  <img src={imageUrl} alt="Preview" className="absolute inset-0 w-full h-full object-contain bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-gray-50" />
                ) : (
                  <>
                    <CloudUpload className="w-8 h-8 text-blue-500 mb-3" />
                    <p className="text-sm font-medium text-gray-700">Drag & drop or click to upload</p>
                    <p className="text-xs text-gray-400 mt-1">Supports JPG, PNG (Max 5MB)</p>
                  </>
                )}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="useAI" 
                  checked={useAI} 
                  onChange={e => setUseAI(e.target.checked)} 
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="useAI" className="text-xs font-semibold text-gray-600 cursor-pointer">
                  Enhance image with AI (Removes background)
                </label>
              </div>
              {imageUrl && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleAnalyzeImage}
                    disabled={analyzingImage}
                    className="w-full py-2 bg-purple-50 text-purple-600 border border-purple-200 rounded-xl text-sm font-semibold hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {analyzingImage ? "Analyzing..." : "✨ Auto-fill product details with AI"}
                  </button>
                </div>
              )}
            </div>

            {/* Product Type & Unit */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Product Type <span className="text-red-500">*</span></label>
                <select 
                  value={productType}
                  onChange={e => setProductType(e.target.value)}
                  className="w-full px-3 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 appearance-none"
                >
                  <option value="Single Product">Single Product</option>
                  <option value="Variable Product">Variable Product</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-semibold text-gray-700">Product Unit</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const newUnit = window.prompt("Enter new unit name:");
                      if (newUnit && newUnit.trim() !== "") {
                        const unitName = newUnit.trim();
                        if (!units.includes(unitName)) {
                          setUnits(prev => [...prev, unitName]);
                        }
                        setUnit(unitName);
                      }
                    }}
                    className="text-[10px] font-semibold text-blue-600 hover:underline"
                  >
                    + Add new
                  </button>
                </div>
                <select 
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  className="w-full px-3 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 appearance-none"
                >
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Product Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Ceramic V60 Dripper" 
                className="w-full px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            {/* Barcode & Category Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Barcode / SKU</label>
                <div className="flex relative">
                  <input 
                    type="text" 
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Scan or enter SKU" 
                    className="w-full pl-4 pr-10 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center space-x-1">
                    <button 
                      type="button" 
                      onClick={() => setBarcode(Math.floor(10000000 + Math.random() * 90000000).toString())}
                      title="Auto-generate 8-digit barcode"
                      className="p-1 bg-[#f3f0ea] rounded-md text-gray-600 hover:bg-gray-200"
                    >
                      <ScanBarcode className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Hidden Barcode for Printing */}
                <div className="hidden">
                  <div ref={barcodePrintRef} className="flex flex-col items-center justify-between p-2 bg-white w-[384px] h-[160px]" style={{ pageBreakInside: 'avoid' }}>
                    <div className="text-center w-full mb-1">
                      <h2 className="font-black italic text-3xl font-sans tracking-tighter text-black m-0" style={{ fontFamily: "'Arial Black', Impact, sans-serif" }}>RIZQ</h2>
                    </div>
                    <div className="flex justify-center w-full">
                      {barcode ? <Barcode value={barcode.length < 8 ? barcode.padStart(8, '0') : barcode} width={1.8} height={55} fontSize={14} margin={0} displayValue={true} /> : null}
                    </div>
                    <div className="flex justify-between items-end w-full mt-2 px-1">
                      <div className="text-left w-[65%]">
                        <p className="text-sm font-bold text-black leading-tight line-clamp-2">{name || "Product Name"}</p>
                      </div>
                      <div className="text-right w-[35%]">
                        <p className="text-xl font-bold text-black m-0">TK {Number(sellingPriceBDT).toFixed(2) || "0.00"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-semibold text-gray-700">Category</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const newCat = window.prompt("Enter new category name:");
                      if (newCat && newCat.trim() !== "") {
                        const catName = newCat.trim();
                        if (!categories.includes(catName)) {
                          setCategories(prev => [...prev, catName]);
                        }
                        setCategory(catName);
                      }
                    }}
                    className="text-[10px] font-semibold text-blue-600 hover:underline"
                  >
                    + Add new
                  </button>
                </div>
                <select 
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 appearance-none"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Quantity</label>
                <input 
                  type="number" 
                  value={stock}
                  onChange={e => setStock(e.target.value === "" ? "" : Number(e.target.value))}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>

            {/* Purchase / Supplier Info */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Purchase Info (Stock Intake)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Supplier Name</label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="e.g., Rahman Traders"
                    className="w-full px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                  <select
                    value={purchasePaymentMethod}
                    onChange={e => setPurchasePaymentMethod(e.target.value as "Cash" | "Card" | "Mobile Banking")}
                    className="w-full px-3 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 appearance-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Mobile Banking">Mobile Banking</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Variants Section (Only visible if Variable Product) */}
            {productType === "Variable Product" && (
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <span className="bg-orange-100 text-orange-500 p-1.5 rounded-lg"><LayoutGrid className="w-4 h-4" /></span>
                    Product Variant List
                  </h3>
                  <button 
                    type="button"
                    onClick={() => setVariants([...variants, { image_url: "", variant_name: "", variant_value: "", sku: "" }])}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
                  >
                    Add Product Variant
                  </button>
                </div>
                
                {variants.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-lg">
                    <p>No variants found!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          <th className="px-4 py-3">Image</th>
                          <th className="px-4 py-3">Variant Name</th>
                          <th className="px-4 py-3">Variant Value</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {variants.map((variant, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2">
                               {/* Simplified Image Placeholder for now */}
                               <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">IMG</div>
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={variant.variant_name} onChange={e => { const newV = [...variants]; newV[index].variant_name = e.target.value; setVariants(newV); }} placeholder="e.g. Color" className="w-full px-2 py-1.5 border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={variant.variant_value} onChange={e => { const newV = [...variants]; newV[index].variant_value = e.target.value; setVariants(newV); }} placeholder="e.g. Red" className="w-full px-2 py-1.5 border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={variant.sku} onChange={e => { const newV = [...variants]; newV[index].sku = e.target.value; setVariants(newV); }} placeholder="SKU" className="w-full px-2 py-1.5 border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button onClick={() => { const newV = [...variants]; newV.splice(index, 1); setVariants(newV); }} className="text-red-500 p-1 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Product Optional Information */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                <span className="bg-orange-100 text-orange-500 p-1.5 rounded-lg"><LayoutGrid className="w-4 h-4" /></span>
                Product Optional Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Brand</label>
                  <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Enter Brand" className="w-full px-3 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Tax Rate (%)</label>
                  <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="0" className="w-full px-3 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Tax Type</label>
                  <select value={taxType} onChange={e => setTaxType(e.target.value)} className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                    <option value="">Choose Tax Type</option>
                    <option value="Exclusive">Exclusive</option>
                    <option value="Inclusive">Inclusive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Enter Description" className="w-full px-3 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"></textarea>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="flex items-center gap-2 mb-4 font-semibold text-sm cursor-pointer">
                  <input type="checkbox" checked={hasWarranty} onChange={e => setHasWarranty(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                  Warranties
                </label>
                {hasWarranty && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Warranty <span className="text-red-500">*</span></label>
                    <input type="text" value={warranty} onChange={e => setWarranty(e.target.value)} placeholder="e.g. 1 Year, 6 Months" className="w-full px-3 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  </div>
                )}
              </div>

              {/* Funding Source */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4">
                <label className="block text-xs font-semibold text-gray-700 mb-2">Funded By</label>
                <div className="flex gap-2 mb-3">
                  <button type="button" onClick={() => setFundingSource("Me")} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${fundingSource === "Me" ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>Me (Self)</button>
                  <button type="button" onClick={() => setFundingSource("Investor")} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${fundingSource === "Investor" ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>Investor</button>
                </div>
                {fundingSource === "Investor" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Select Investor</label>
                    <select value={investorId} onChange={e => setInvestorId(e.target.value)} className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                      <option value="" disabled>Select an investor...</option>
                      {investors.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Pricing & Profitability */}
          <div className="w-full lg:w-[340px] bg-[#f8f6f0] rounded-2xl p-6 border border-gray-100 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Pricing</h3>
              <div className="flex bg-gray-200 p-1 rounded-lg">
                <button 
                  type="button"
                  onClick={() => setCostCurrency("CNY")} 
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${costCurrency === "CNY" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  CNY ¥
                </button>
                <button 
                  type="button"
                  onClick={() => setCostCurrency("BDT")} 
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${costCurrency === "BDT" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  BDT ৳
                </button>
              </div>
            </div>
            
            <div className="space-y-5 flex-1">
              {costCurrency === "CNY" ? (
                <>
                  {/* Bank Rate */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bank Exchange Rate (BDT/CNY)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={bankRate}
                        onChange={e => setBankRate(Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        step="0.01"
                        className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                  </div>

                  {/* Cost Price (CNY) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cost Price (CNY ¥)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">¥</span>
                      </div>
                      <input 
                        type="number" 
                        value={costCNY}
                        onChange={e => setCostCNY(e.target.value === "" ? "" : Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.00" 
                        className="w-full pl-8 pr-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                  </div>

                  {/* Cost in BDT */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Cost in BDT (Auto-calculated @ {bankRate})</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">৳</span>
                      </div>
                      <input 
                        type="text" 
                        value={costBDT.toFixed(2)} 
                        readOnly
                        className="w-full pl-8 pr-4 py-2.5 bg-gray-100/50 text-gray-900 border border-gray-200 rounded-xl text-sm font-medium cursor-not-allowed"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Direct Cost in BDT */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cost Price (BDT ৳)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-sm font-medium">৳</span>
                      </div>
                      <input 
                        type="number" 
                        value={directCostBDT}
                        onChange={e => setDirectCostBDT(e.target.value === "" ? "" : Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0.00" 
                        className="w-full pl-8 pr-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Shipping Charge */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Shipping Charge (BDT ৳)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input 
                    type="number" 
                    value={shippingBDT}
                    onChange={e => setShippingBDT(e.target.value === "" ? "" : Number(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0.00" 
                    className="w-full pl-8 pr-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              </div>

              {/* True Landed Cost */}
              <div className="flex justify-between items-center py-3 border-y border-gray-200/60">
                <span className="text-sm font-semibold text-gray-700">True Landed Cost</span>
                <span className="text-lg font-bold text-gray-900">৳ {trueLandedCost.toFixed(2)}</span>
              </div>

              {/* Selling Price */}
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Selling Price (BDT ৳)</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-500">Add Margin:</span>
                    <div className="relative w-24">
                      <input 
                        type="number"
                        placeholder="e.g. 20"
                        value={targetMargin}
                        onChange={e => setTargetMargin(e.target.value === "" ? "" : Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full pl-2 pr-6 py-1 bg-white text-gray-900 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                      <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                        <span className="text-gray-400 text-xs font-medium">%</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm font-medium">৳</span>
                  </div>
                  <input 
                    type="number" 
                    value={sellingPriceBDT}
                    onChange={e => {
                      setSellingPriceBDT(e.target.value === "" ? "" : Number(e.target.value));
                      setTargetMargin("");
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0.00" 
                    className="w-full pl-8 pr-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                
                {/* Expected Profit Card directly below Selling Price */}
                <div className="mt-2 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Expected Profit</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${expectedProfit >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                      ~ {profitMargin.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-black text-gray-900">৳ {expectedProfit.toFixed(2)}</span>
                    <span className="text-xs font-medium text-gray-400 ml-1">/ unit</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

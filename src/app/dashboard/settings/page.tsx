"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Check,
  LogOut,
  Printer,
  Store,
  User,
  Upload,
  Trash2,
  Image as ImageIcon,
  Smartphone,
  Eye,
  Sliders,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/utils/supabase/client";
import { loadStoreSettings, StorePrintSettings } from "@/components/ReceiptModal";

export default function SettingsPage() {
  const { user, role } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store information
  const [shopName, setShopName] = useState("RIZQ");
  const [shopTagline, setShopTagline] = useState("Footwear & Shoes");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [receiptFooter, setReceiptFooter] = useState(
    "Thank you for shopping at Rizq!"
  );
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");

  // Logo & PDA Thermal configuration
  const [logoUrl, setLogoUrl] = useState("");
  const [showLogoOnReceipt, setShowLogoOnReceipt] = useState(true);
  const [logoFilter, setLogoFilter] = useState<"grayscale" | "original">(
    "grayscale"
  );
  const [logoSize, setLogoSize] = useState<"sm" | "md" | "lg">("md");
  const [nanoBananaApiKey, setNanoBananaApiKey] = useState("");

  // UI state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [savedBanner, setSavedBanner] = useState(false);
  const [previewPaperWidth, setPreviewPaperWidth] = useState<"80mm" | "58mm">(
    "58mm"
  );

  useEffect(() => {
    const s = loadStoreSettings();
    setShopName(s.shopName);
    setShopTagline(s.shopTagline);
    setShopAddress(s.shopAddress);
    setShopPhone(s.shopPhone);
    setReceiptFooter(s.receiptFooter);
    setPaperWidth(s.paperWidth);
    setLogoUrl(s.logoUrl || "");
    setShowLogoOnReceipt(s.showLogoOnReceipt !== false);
    setLogoFilter(s.logoFilter || "grayscale");
    setLogoSize(s.logoSize || "md");
    setNanoBananaApiKey(s.nanoBananaApiKey || "");
    setPreviewPaperWidth(s.paperWidth);
  }, []);

  // Process & compress logo file for fast loading and crisp thermal printing
  const processImageFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxW = 460;
          const maxH = 280;
          let width = img.width;
          let height = img.height;

          if (width > maxW || height > maxH) {
            const ratio = Math.min(maxW / width, maxH / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }

          // Crisp rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          // Return high-quality PNG data URL
          resolve(canvas.toDataURL("image/png", 0.95));
        };
        img.onerror = () => reject(new Error("Unable to read image file"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to load file"));
      reader.readAsDataURL(file);
    });
  };

  const handleLogoFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file (PNG, JPG, SVG, WebP).");
      return;
    }

    setUploadingLogo(true);
    setLogoError("");

    try {
      const optimizedDataUrl = await processImageFile(file);

      // Attempt to save to Supabase storage bucket `product_images`
      try {
        const fileExt = file.name.split(".").pop() || "png";
        const filePath = `logos/shop-logo-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("product_images")
          .upload(filePath, file, { upsert: true });

        if (!uploadError) {
          const { data } = supabase.storage
            .from("product_images")
            .getPublicUrl(filePath);
          if (data?.publicUrl) {
            setLogoUrl(data.publicUrl);
            setUploadingLogo(false);
            return;
          }
        }
      } catch (storageErr) {
        // Fallback gracefully to optimized data URL
        console.warn("Storage upload fallback to base64:", storageErr);
      }

      setLogoUrl(optimizedDataUrl);
    } catch (err: any) {
      setLogoError(err?.message || "Failed to process logo image.");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl("");
    setLogoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const settingsPayload: StorePrintSettings = {
      shopName: shopName.trim() || "RIZQ",
      shopTagline: shopTagline.trim(),
      shopAddress: shopAddress.trim(),
      shopPhone: shopPhone.trim(),
      receiptFooter:
        receiptFooter.trim() || "Thank you for shopping at Rizq!",
      paperWidth,
      logoUrl: logoUrl.trim(),
      showLogoOnReceipt,
      logoFilter,
      logoSize,
      nanoBananaApiKey: nanoBananaApiKey.trim(),
    };

    localStorage.setItem(
      "rizq_store_settings",
      JSON.stringify(settingsPayload)
    );
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 lg:p-8 no-scrollbar">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
            Settings &amp; Branding
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Store logo, PDA handheld thermal printer optimization, and receipt details
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Logo & PDA Thermal Section */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    Store Logo &amp; PDA Thermal Support
                  </h2>
                  <p className="text-xs text-gray-500">
                    Optimized for Sunmi, Telpo, Android PDA handhelds (58mm) and countertop thermal printers
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Logo Controls */}
              <div className="lg:col-span-7 space-y-4">
                {/* Upload or URL */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-2">
                    Shop Logo
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileUpload}
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[46px] px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-black active:scale-95 transition-all shadow-xs disabled:opacity-50"
                    >
                      {uploadingLogo ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>{logoUrl ? "Change Logo" : "Upload Logo"}</span>
                        </>
                      )}
                    </button>

                    {logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="min-h-[46px] px-3.5 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  {logoError && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      <span>{logoError}</span>
                    </div>
                  )}

                  {/* Or enter Image URL */}
                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                      Or paste an Image URL:
                    </label>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="w-full min-h-[42px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                    />
                  </div>
                </div>

                {/* Print Options */}
                <div className="pt-3 border-t border-gray-100 space-y-3.5">
                  {/* Show Logo Toggle */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <span className="text-xs font-bold text-gray-900 block">
                        Print Logo on Receipts
                      </span>
                      <span className="text-[11px] text-gray-500">
                        Include shop logo at the top of printed thermal receipts
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showLogoOnReceipt}
                        onChange={(e) => setShowLogoOnReceipt(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                    </label>
                  </div>

                  {/* PDA Monochrome Filter Toggle */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-900">
                          PDA High-Contrast Thermal Filter
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                          Recommended
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-500 block mt-0.5">
                        Converts logo to crisp 1-bit black &amp; white so PDA thermal heads print without faint smudges
                      </span>
                    </div>
                    <div className="flex bg-gray-200 p-0.5 rounded-lg text-xs font-bold shrink-0">
                      <button
                        type="button"
                        onClick={() => setLogoFilter("grayscale")}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          logoFilter === "grayscale"
                            ? "bg-black text-white shadow-xs"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        B&amp;W PDA
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogoFilter("original")}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          logoFilter === "original"
                            ? "bg-black text-white shadow-xs"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        Color
                      </button>
                    </div>
                  </div>

                  {/* Logo Sizing for Thermal */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                      Logo Size on Thermal Print
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "sm", label: "Small", pda: "100px / 30mm" },
                        {
                          id: "md",
                          label: "Standard",
                          pda: "130px (PDA 58mm)",
                        },
                        { id: "lg", label: "Large", pda: "160px / 46mm" },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setLogoSize(s.id as "sm" | "md" | "lg")
                          }
                          className={`min-h-[46px] p-2 rounded-xl text-center border-2 transition-all ${
                            logoSize === s.id
                              ? "border-black bg-gray-900 text-white shadow-xs"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span className="block text-xs font-bold">
                            {s.label}
                          </span>
                          <span
                            className={`block text-[10px] mt-0.5 ${
                              logoSize === s.id
                                ? "text-gray-300"
                                : "text-gray-400"
                            }`}
                          >
                            {s.pda}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live PDA Receipt Preview */}
              <div className="lg:col-span-5 bg-gray-100/80 rounded-2xl p-4 border border-gray-200 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Live Receipt Preview
                    </span>
                  </div>

                  <div className="flex bg-white p-0.5 rounded-lg border border-gray-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setPreviewPaperWidth("58mm")}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        previewPaperWidth === "58mm"
                          ? "bg-black text-white"
                          : "text-gray-600 hover:text-black"
                      }`}
                    >
                      58mm (PDA)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPaperWidth("80mm")}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        previewPaperWidth === "80mm"
                          ? "bg-black text-white"
                          : "text-gray-600 hover:text-black"
                      }`}
                    >
                      80mm
                    </button>
                  </div>
                </div>

                {/* Receipt Preview Paper */}
                <div
                  className={`bg-white rounded-lg shadow-sm border border-gray-300 p-3 sm:p-4 text-center font-mono transition-all ${
                    previewPaperWidth === "58mm"
                      ? "w-[240px] text-[10.5px]"
                      : "w-[280px] text-xs"
                  }`}
                >
                  {showLogoOnReceipt && logoUrl ? (
                    <div className="flex justify-center mb-2">
                      <img
                        src={
                          logoUrl === "/logo.png" && logoFilter === "grayscale"
                            ? "/logo-thermal.png"
                            : logoUrl
                        }
                        alt="Store Logo"
                        className={`mx-auto object-contain transition-all ${
                          logoFilter === "grayscale"
                            ? "contrast-125"
                            : ""
                        } ${
                          previewPaperWidth === "58mm"
                            ? logoSize === "sm"
                              ? "max-w-[100px] max-h-[42px]"
                              : logoSize === "lg"
                              ? "max-w-[155px] max-h-[60px]"
                              : "max-w-[125px] max-h-[50px]"
                            : logoSize === "sm"
                            ? "max-w-[130px] max-h-[50px]"
                            : logoSize === "lg"
                            ? "max-w-[195px] max-h-[75px]"
                            : "max-w-[160px] max-h-[62px]"
                        }`}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg border border-dashed border-gray-300 flex items-center justify-center mx-auto mb-2 text-gray-300">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}

                  <h3 className="font-black text-sm uppercase tracking-wider text-black">
                    {shopName || "RIZQ"}
                  </h3>
                  {shopTagline && (
                    <p className="text-[10px] text-gray-600 font-sans mt-0.5">
                      {shopTagline}
                    </p>
                  )}
                  {shopAddress && (
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {shopAddress}
                    </p>
                  )}
                  {shopPhone && (
                    <p className="text-[10px] text-gray-600">Tel: {shopPhone}</p>
                  )}

                  <div className="border-b border-dashed border-gray-400 my-2" />
                  <p className="text-[9px] text-gray-400 font-sans italic">
                    Sample Receipt Header ({previewPaperWidth})
                  </p>
                </div>

                <p className="text-[11px] text-gray-500 text-center mt-3 leading-snug">
                  {previewPaperWidth === "58mm"
                    ? "📱 PDA Handhelds (Sunmi V2, Telpo, iMin) print cleanly on 58mm rolls."
                    : "🖨️ Countertop 80mm printers have a wider print area."}
                </p>
              </div>
            </div>
          </div>

          {/* Store & Receipt Text Details */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-[#f3f0ea] flex items-center justify-center">
                <Store className="w-4 h-4 text-gray-800" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  Store Information &amp; Default Width
                </h2>
                <p className="text-xs text-gray-500">
                  Printed on every POS receipt (Tax is always 0 in Rizq POS)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                  Shop Name
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                  Subtitle / Tagline
                </label>
                <input
                  type="text"
                  value={shopTagline}
                  onChange={(e) => setShopTagline(e.target.value)}
                  placeholder="Footwear & Shoes"
                  className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                  Shop Phone
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                  Default Printer Paper Width
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { width: "58mm" as const, desc: "PDA / Mobile" },
                    { width: "80mm" as const, desc: "Countertop" },
                  ].map((item) => (
                    <button
                      key={item.width}
                      type="button"
                      onClick={() => {
                        setPaperWidth(item.width);
                        setPreviewPaperWidth(item.width);
                      }}
                      className={`min-h-[46px] rounded-xl text-sm font-bold border-2 flex flex-col items-center justify-center p-2 transition-colors ${
                        paperWidth === item.width
                          ? "border-black bg-gray-900 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Printer className="w-3.5 h-3.5" />
                        <span>{item.width}</span>
                      </div>
                      <span
                        className={`text-[10px] ${
                          paperWidth === item.width
                            ? "text-gray-300"
                            : "text-gray-400"
                        }`}
                      >
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                Shop Address
              </label>
              <input
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Shop address for receipt header"
                className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                Receipt Footer Message
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="Thank you for shopping at Rizq!"
                className="w-full min-h-[46px] px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900"
              />
            </div>

            {/* Nano Banana AI Integration */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase">
                    Nano Banana AI Image Enhancement
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Powers automatic background removal &amp; studio lighting when adding products
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Nano Banana API Key (Optional)
                </label>
                <input
                  type="password"
                  value={nanoBananaApiKey}
                  onChange={(e) => setNanoBananaApiKey(e.target.value)}
                  placeholder="Paste your Nano Banana API key (e.g. nb_live_...)"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:bg-white focus:border-gray-900 font-mono"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  💡 Even without an external API key, the POS automatically uses its built-in studio AI engine to isolate shoes and create crisp pure white product photos.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              {savedBanner ? (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> Settings &amp; Logo saved!
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="min-h-[46px] px-6 py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 active:scale-95 transition-all shadow-sm"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>

        {/* Account Card */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 capitalize">
                Role: {role || "Staff"}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email || "Signed in"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

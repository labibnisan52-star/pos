"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Image as ImageIcon,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Wifi,
  WifiOff,
  Zap,
  ZapOff,
} from "lucide-react";
import { formatBDT } from "@/lib/calculations";
import { VISUAL_MATCH_THRESHOLD } from "@/lib/visual-search/constants";
import { getVisualSearchDB } from "@/lib/visual-search/db";
import {
  computeImageEmbedding,
  warmupVisualModel,
} from "@/lib/visual-search/embedder";
import {
  captureVideoFrameForEmbedding,
  prepareFileForEmbedding,
} from "@/lib/visual-search/image";
import {
  rankVisualMatches,
  type MatchableProduct,
  type MatchableVariant,
  type VisualSearchMatch,
  type VisualSearchResult,
} from "@/lib/visual-search/similarity";

export interface VisualSearchCartItem {
  cartKey: string;
  quantity: number;
}

interface VisualSearchModalProps {
  isOpen: boolean;
  isOnline: boolean;
  products: MatchableProduct[];
  variants: MatchableVariant[];
  cart: VisualSearchCartItem[];
  onClose: () => void;
  onAddMatchToCart: (
    productId: string,
    variantId: string | null
  ) => void;
  onUpdateCartDelta: (cartKey: string, delta: number) => void;
  onFallbackSearchManually: () => void;
  onFallbackScanBarcode: () => void;
}

type ViewStep = "camera" | "searching" | "results" | "no_match";

export default function VisualSearchModal({
  isOpen,
  isOnline,
  products,
  variants,
  cart,
  onClose,
  onAddMatchToCart,
  onUpdateCartDelta,
  onFallbackSearchManually,
  onFallbackScanBarcode,
}: VisualSearchModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ViewStep>("camera");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(
    null
  );
  const [searchResult, setSearchResult] = useState<VisualSearchResult | null>(
    null
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const [modelDevice, setModelDevice] = useState<"webgpu" | "wasm" | null>(
    null
  );
  const [debugMode, setDebugMode] = useState(false);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.cartKey, item.quantity);
    }
    return map;
  }, [cart]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Camera is not available in this browser. Pick a photo from your gallery instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === "function") {
        const caps = track.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(caps?.torch));
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError(
          "Camera permission was denied. Allow camera access in your browser settings or pick a photo from your gallery."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError(
          "No camera found on this device. You can pick a photo from your gallery instead."
        );
      } else {
        setCameraError(
          "Could not start the camera. Try closing other camera apps or pick a photo from your gallery."
        );
      }
    }
  }, [stopCamera]);

  // Lazy-load CLIP vision model + start camera only when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    warmupVisualModel()
      .then((dev) => {
        if (!cancelled) setModelDevice(dev);
      })
      .catch(() => {
        // Error will be surfaced cleanly if user captures while model fails
      });

    const timer = setTimeout(() => {
      if (!cancelled) {
        void startCamera();
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setTorchOn(false);
    };
  }, [isOpen, startCamera]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const runEmbeddingMatch = useCallback(
    async (embeddingBlob: Blob) => {
      setStep("searching");
      setSearchError(null);

      try {
        const { embedding, device } = await computeImageEmbedding(embeddingBlob);
        setModelDevice(device);

        const db = getVisualSearchDB();
        const [cachedEmbeddings, cachedProducts, cachedVariants] =
          await Promise.all([
            db.embeddings.toArray(),
            db.products.toArray(),
            db.variants.toArray(),
          ]);

        // Merge live POS catalog with Dexie cache so newly added products work immediately
        const productsMap = new Map<string, MatchableProduct>();
        for (const p of cachedProducts) productsMap.set(p.id, p);
        for (const p of products) productsMap.set(p.id, p);

        const variantsMap = new Map<string, MatchableVariant>();
        for (const v of cachedVariants) variantsMap.set(v.id, v);
        for (const v of variants) variantsMap.set(v.id, v);

        const ranked = rankVisualMatches(
          embedding,
          cachedEmbeddings,
          productsMap,
          variantsMap,
          { topK: 5, threshold: VISUAL_MATCH_THRESHOLD }
        );

        setSearchResult(ranked);
        if (ranked.matches.length === 0 || !ranked.meetsThreshold) {
          setStep("no_match");
        } else {
          setStep("results");
        }
      } catch (err) {
        setSearchError(
          err instanceof Error
            ? err.message
            : "Visual search failed. Please try again."
        );
        setStep("no_match");
      }
    },
    [products, variants]
  );

  const handleCapture = async () => {
    if (!videoRef.current) return;
    try {
      const { fullPreviewUrl, embeddingBlob } =
        await captureVideoFrameForEmbedding(videoRef.current);
      setCapturedPreviewUrl(fullPreviewUrl);
      stopCamera();
      await runEmbeddingMatch(embeddingBlob);
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : "Could not capture photo."
      );
    }
  };

  const handleGalleryPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSearchError("Please choose an image file.");
      setStep("no_match");
      return;
    }

    const preview = URL.createObjectURL(file);
    setCapturedPreviewUrl(preview);
    stopCamera();

    try {
      const embeddingBlob = await prepareFileForEmbedding(file);
      await runEmbeddingMatch(embeddingBlob);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Could not process selected photo."
      );
      setStep("no_match");
    }
  };

  const handleRetake = () => {
    setSearchError(null);
    setSearchResult(null);
    setCapturedPreviewUrl(null);
    setStep("camera");
    void startCamera();
  };

  if (!isOpen) return null;

  const renderConfidenceBadge = (match: VisualSearchMatch) => {
    const isHigh = match.score >= 0.75;
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
          isHigh
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
            : "bg-amber-50 text-amber-800 border border-amber-200"
        }`}
      >
        {match.confidencePct}% match
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleGalleryPick}
        className="hidden"
      />

      {/* Top Bar */}
      <header className="shrink-0 px-4 py-3 flex items-center justify-between gap-2 bg-gray-950/90 border-b border-white/10">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          aria-label="Back to POS"
          className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <p className="text-sm font-bold tracking-tight">
            Visual Product Search
          </p>
          <p className="text-[11px] text-gray-400">Works offline</p>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 min-h-[34px] rounded-full text-xs font-bold ${
            isOnline
              ? "bg-emerald-900/80 text-emerald-200 border border-emerald-700"
              : "bg-gray-800 text-gray-300 border border-gray-700"
          }`}
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5" />
          ) : (
            <WifiOff className="w-3.5 h-3.5" />
          )}
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>
      </header>

      {/* SCREEN 2: Camera Capture */}
      {step === "camera" && (
        <div className="flex-1 flex flex-col min-h-0 relative bg-black">
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 max-w-sm text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-sm text-gray-200 font-medium leading-relaxed">
                  {cameraError}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="min-h-[48px] px-5 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Choose Photo from Gallery</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="min-h-[44px] px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-bold"
                  >
                    Retry Camera
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                {/* Center Guide Frame */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
                  <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-2xl border-2 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                  <p className="mt-4 px-3.5 py-1.5 rounded-full bg-black/70 text-xs font-semibold text-white">
                    Place the product inside the frame
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Bottom Camera Controls */}
          <div className="shrink-0 px-6 py-5 bg-gray-950 flex items-center justify-around border-t border-white/10 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleToggleTorch}
              disabled={!torchSupported || Boolean(cameraError)}
              aria-label="Toggle flash"
              className={`min-w-[52px] min-h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                torchOn
                  ? "bg-amber-500 text-black"
                  : "bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
              }`}
            >
              {torchOn ? (
                <Zap className="w-5 h-5" />
              ) : (
                <ZapOff className="w-5 h-5" />
              )}
              <span>Flash</span>
            </button>

            <button
              type="button"
              onClick={handleCapture}
              disabled={Boolean(cameraError)}
              aria-label="Capture photo"
              className="w-20 h-20 rounded-full border-4 border-white bg-emerald-700 hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
            >
              <div className="w-14 h-14 rounded-full bg-white/95" />
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              aria-label="Pick from gallery"
              className="min-w-[52px] min-h-[52px] rounded-2xl bg-white/10 hover:bg-white/20 text-white flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
              <span>Gallery</span>
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 3: Searching State */}
      {step === "searching" && (
        <div className="flex-1 overflow-y-auto bg-[#faf9f6] text-gray-900 p-4">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-3 flex items-center gap-3">
              {capturedPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedPreviewUrl}
                  alt="Captured product"
                  className="w-16 h-16 rounded-xl object-cover shrink-0 border border-gray-100"
                />
              )}
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Finding matching products...
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Matching on-device with CLIP vision
                </p>
              </div>
            </div>

            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-200 p-3.5 flex items-center gap-3 animate-pulse"
              >
                <div className="w-16 h-16 rounded-xl bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-8 bg-gray-100 rounded-xl w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCREEN 4: Top 5 Results */}
      {step === "results" && searchResult && (
        <div className="flex-1 overflow-y-auto bg-[#faf9f6] text-gray-900 p-4 pb-8">
          <div className="mx-auto max-w-lg space-y-3">
            {/* Captured Thumbnail + Retake + Debug Toggle */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {capturedPreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={capturedPreviewUrl}
                    alt="Captured photo"
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-gray-100"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    Top {searchResult.matches.length} Matches
                  </p>
                  <p className="text-xs text-gray-500">
                    {modelDevice ? `On-device (${modelDevice.toUpperCase()})` : "On-device"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDebugMode((d) => !d)}
                  className={`min-h-[36px] px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                    debugMode
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  Debug
                </button>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="min-h-[36px] px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>
              </div>
            </div>

            {!isOnline && (
              <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
                You&apos;re offline. Using on-device search.
              </div>
            )}

            {/* Match Cards */}
            <div className="space-y-2.5">
              {searchResult.matches.map((match, idx) => {
                const variantId = match.variant?.id ?? null;
                const cartKey = `${match.product.id}::${variantId ?? "base"}`;
                const qtyInCart = cartQtyMap.get(cartKey) ?? 0;
                const displayPrice =
                  match.variant?.price !== null &&
                  match.variant?.price !== undefined &&
                  Number(match.variant.price) > 0
                    ? Number(match.variant.price)
                    : Number(match.product.price) || 0;
                const outOfStock = (Number(match.product.stock) || 0) <= 0;

                return (
                  <div
                    key={cartKey}
                    className={`bg-white rounded-2xl border p-3.5 space-y-3 ${
                      idx === 0
                        ? "border-emerald-600 ring-1 ring-emerald-600/20"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {match.sourceImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={match.sourceImageUrl}
                            alt={match.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {idx === 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900 text-white">
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              Best match
                            </span>
                          )}
                          {renderConfidenceBadge(match)}
                          {debugMode && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-gray-100 text-gray-800">
                              cos={match.score.toFixed(4)}
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-bold text-gray-900 truncate">
                          {match.product.name}
                        </p>

                        {match.variant && (
                          <p className="text-xs font-medium text-gray-600">
                            {match.variant.variant_name
                              ? `${match.variant.variant_name}: ${match.variant.variant_value}`
                              : match.variant.variant_value}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm font-black text-emerald-900">
                            ৳{formatBDT(displayPrice)}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              outOfStock ? "text-red-600" : "text-gray-500"
                            }`}
                          >
                            {outOfStock
                              ? "Out of stock"
                              : `${match.product.stock} in stock`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Add to Cart / Quantity Stepper */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100">
                      {qtyInCart > 0 ? (
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> In Cart
                          </span>
                          <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => onUpdateCartDelta(cartKey, -1)}
                              aria-label="Decrease quantity"
                              className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-800"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-7 text-center text-sm font-black text-gray-900">
                              {qtyInCart}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateCartDelta(cartKey, 1)}
                              aria-label="Increase quantity"
                              className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-800"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() =>
                            onAddMatchToCart(match.product.id, variantId)
                          }
                          className="w-full min-h-[44px] px-4 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add to Cart</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Fallback Actions */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onFallbackScanBarcode();
                }}
                className="w-full min-h-[46px] px-4 rounded-2xl bg-white border border-gray-200 text-gray-900 text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan Barcode instead</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onFallbackSearchManually();
                }}
                className="w-full min-h-[42px] text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Not here? Search manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 5: No Match / Offline Empty State */}
      {step === "no_match" && (
        <div className="flex-1 overflow-y-auto bg-[#faf9f6] text-gray-900 p-4 flex items-center justify-center">
          <div className="w-full max-w-md space-y-4">
            {!isOnline && (
              <div className="px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 text-center">
                You&apos;re offline. Using on-device search.
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-4">
              {capturedPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedPreviewUrl}
                  alt="Captured photo"
                  className="w-20 h-20 mx-auto rounded-2xl object-cover border border-gray-200"
                />
              )}

              <div>
                <h3 className="text-lg font-black text-gray-900">
                  No close match found
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {searchError
                    ? searchError
                    : searchResult && searchResult.matches.length === 0
                      ? "No visual embeddings are indexed yet. Index your products in Products → Visual Index."
                      : `Best similarity (${Math.round(
                          (searchResult?.bestScore ?? 0) * 100
                        )}%) was below the ${Math.round(
                          VISUAL_MATCH_THRESHOLD * 100
                        )}% threshold.`}
                </p>
              </div>

              {searchResult && searchResult.matches.length > 0 && (
                <div className="text-left">
                  <button
                    type="button"
                    onClick={() => setDebugMode((d) => !d)}
                    className="text-xs font-bold text-amber-800 underline"
                  >
                    {debugMode ? "Hide debug scores" : "Show debug scores"}
                  </button>
                  {debugMode && (
                    <div className="mt-2 p-2.5 rounded-xl bg-gray-50 border border-gray-200 space-y-1 text-[11px] font-mono text-gray-700">
                      {searchResult.matches.map((m) => (
                        <div
                          key={`${m.product.id}::${m.variant?.id ?? "base"}`}
                          className="flex justify-between gap-2"
                        >
                          <span className="truncate">{m.product.name}</span>
                          <span>{m.score.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="w-full min-h-[48px] px-4 rounded-2xl bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Retake photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onFallbackSearchManually();
                  }}
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-white border border-gray-200 text-gray-900 text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
                >
                  <Search className="w-4 h-4" />
                  <span>Search by name</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onFallbackScanBarcode();
                  }}
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-white border border-gray-200 text-gray-900 text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan barcode</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

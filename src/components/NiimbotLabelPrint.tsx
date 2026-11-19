"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Barcode from "react-barcode";
import { useTranslation } from "@/lib/i18n";
import { Z_INDEX } from "@/lib/z-index";

// We import types statically because TypeScript strips them at build time, avoiding SSR execution.
import type { NiimbotAbstractClient } from "@mmote/niimbluelib";

type NiimbotLabelPrintProps = {
  productName: string;
  productPrice: number;
  barcodeValue: string;
  /** Render prop: receives the triggerPrint function and connection status */
  children: (triggerPrint: () => void, status: PrintStatus) => React.ReactNode;
};

type PrintStatus = {
  isConnecting: boolean;
  isPrinting: boolean;
  error: string | null;
  connected: boolean;
};

// Singleton state (persists across renders and component instances)
let globalClient: NiimbotAbstractClient | null = null;
let globalConnected = false;

const PRINTER_MODE_STORAGE_KEY = "rizq_label_printer_mode";
const PRINTER_MODE_EVENT = "rizq-label-printer-mode-change";

type LabelPrinterMode = "device" | "bluetooth";

function readSavedPrinterMode(): LabelPrinterMode {
  if (typeof window === "undefined") return "device";
  try {
    const saved = localStorage.getItem(PRINTER_MODE_STORAGE_KEY);
    return saved === "bluetooth" ? "bluetooth" : "device";
  } catch {
    return "device";
  }
}

function savePrinterMode(mode: LabelPrinterMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRINTER_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(PRINTER_MODE_EVENT, { detail: mode }));
  } catch {
    // Ignore storage errors
  }
}

export default function NiimbotLabelPrint({
  productName,
  productPrice,
  barcodeValue,
  children,
}: NiimbotLabelPrintProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PrintStatus>({
    isConnecting: false,
    isPrinting: false,
    error: null,
    connected: globalConnected,
  });

  // Auto-pad short barcodes to at least 8 digits to produce valid, scannable Code128 bars
  const effectiveBarcode = barcodeValue && barcodeValue.length < 8 
    ? barcodeValue.padStart(8, '0') 
    : barcodeValue;

  // Draw the label on the canvas
  const drawLabel = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) { resolve(); return; }

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(); return; }

      // Disable image smoothing for ultra-crisp thermal printer 1D barcode lines
      ctx.imageSmoothingEnabled = false;

      // NIIMBOT B1 is 203 DPI, max printhead width is 48mm (384 pixels)
      // For a 50x20mm label feeding horizontally, we use:
      const W = 384;
      const H = 160;
      canvas.width = W;
      canvas.height = H;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      // Top Center: Brand Name "RIZQ"
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "italic 900 32px 'Arial Black', Impact, sans-serif";
      ctx.fillText("RIZQ", W / 2, 6);

      const barcodeContainer = barcodeContainerRef.current;
      if (barcodeContainer && effectiveBarcode) {
        const svgElement = barcodeContainer.querySelector("svg");
        if (svgElement) {
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(svgBlob);

          const img = new Image();
          img.onload = () => {
            // Middle: Barcode with Number Below
            const targetW = 280;
            const targetH = 75;
            const barcodeX = (W - targetW) / 2;
            const barcodeY = 40;
            ctx.drawImage(img, barcodeX, barcodeY, targetW, targetH);
            URL.revokeObjectURL(url);

            // Bottom Left: Product Details
            ctx.textAlign = "left";
            ctx.font = "bold 16px Arial, Helvetica, sans-serif";
            const maxTextWidth = W * 0.65;
            const words = productName.split(" ");
            let lines: string[] = [];
            let currentLine = "";

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const metrics = ctx.measureText(testLine);
              if (metrics.width > maxTextWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
            if (currentLine) lines.push(currentLine);
            lines = lines.slice(0, 2);

            const textStartY = 122;
            const lineHeight = 18;

            for (let i = 0; i < lines.length; i++) {
              ctx.fillText(lines[i], 12, textStartY + i * lineHeight, maxTextWidth);
            }

            // Bottom Right: Price
            ctx.textAlign = "right";
            ctx.font = "bold 26px Arial, Helvetica, sans-serif";
            ctx.fillText(`TK ${productPrice.toFixed(2)}`, W - 12, 126);

            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
          return;
        }
      }
      resolve();
    });
  }, [productName, productPrice, effectiveBarcode]);

  useEffect(() => {
    const timer = setTimeout(() => { drawLabel(); }, 150);
    return () => clearTimeout(timer);
  }, [drawLabel]);

  const [showModal, setShowModal] = useState(false);
  const [printerMode, setPrinterMode] = useState<LabelPrinterMode>(() =>
    readSavedPrinterMode()
  );
  const [printQtyInput, setPrintQtyInput] = useState("1");
  const [portalMounted, setPortalMounted] = useState(false);
  const [rememberMode, setRememberMode] = useState(true);
  const [printDialogError, setPrintDialogError] = useState<{
    isRfidError: boolean;
    isUsbFallbackAvailable?: boolean;
    message: string;
    rawError?: string;
    qty: number;
  } | null>(null);

  useEffect(() => {
    const mountTimer = setTimeout(() => setPortalMounted(true), 0);
    const onModeSync = (e: Event) => {
      const next = (e as CustomEvent<LabelPrinterMode>).detail;
      if (next === "device" || next === "bluetooth") {
        setPrinterMode(next);
      }
    };
    window.addEventListener(PRINTER_MODE_EVENT, onModeSync);
    return () => {
      clearTimeout(mountTimer);
      window.removeEventListener(PRINTER_MODE_EVENT, onModeSync);
    };
  }, []);

  const handleSelectPrinterMode = (mode: LabelPrinterMode) => {
    setPrinterMode(mode);
    savePrinterMode(mode);
  };
  const printQty = Math.max(1, parseInt(printQtyInput, 10) || 1);
  const setPrintQty = (val: number | ((prev: number) => number)) => {
    setPrintQtyInput((prevStr) => {
      const current = Math.max(1, parseInt(prevStr, 10) || 1);
      const next = typeof val === "function" ? val(current) : val;
      return String(Math.max(1, next));
    });
  };

  const executePrint = useCallback(async (quantityToPrint: number = 1) => {
    const count = Math.max(1, Math.min(1000, quantityToPrint));

    if (!barcodeValue) {
      setPrintDialogError({
        isRfidError: false,
        message: t("labelPrint.noBarcode"),
        qty: count,
      });
      return;
    }

    if (!navigator.bluetooth) {
      setPrintDialogError({
        isRfidError: false,
        message: t("labelPrint.bluetoothUnsupported"),
        qty: count,
      });
      return;
    }

    try {
      const { NiimbotBluetoothClient } = await import("@mmote/niimbluelib/dist/cjs/client/bluetooth_impl");
      const { ImageEncoder } = await import("@mmote/niimbluelib/dist/cjs/image_encoder");
      const { LabelType } = await import("@mmote/niimbluelib/dist/cjs/packets/index");

      if (!globalClient || !globalConnected || !globalClient.isConnected()) {
        setStatus(s => ({ ...s, isConnecting: true, error: null }));
        globalClient = new NiimbotBluetoothClient();
        globalClient.on("disconnect", () => {
          globalConnected = false;
        });
        await globalClient.connect();
        await globalClient.fetchPrinterInfo();
        globalConnected = true;
        setStatus(s => ({ ...s, isConnecting: false, connected: true }));
      }

      setStatus(s => ({ ...s, isPrinting: true, error: null }));

      await drawLabel();

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not found");

      const meta = globalClient.getModelMetadata();
      const printDirection = meta?.printDirection ?? "top";
      const density = meta?.densityDefault ?? 3;

      const encodedImage = ImageEncoder.encodeCanvas(canvas, printDirection);
      const taskType = globalClient.getPrintTaskType() || "B1";

      const printTask = globalClient.abstraction.newPrintTask(taskType, {
        totalPages: count,
        density,
        labelType: LabelType.WithGaps,
      });

      await printTask.printInit();
      try {
        await printTask.printPage(encodedImage, count);
        try {
          await printTask.waitForFinished();
        } catch (waitErr: unknown) {
          const waitMsg =
            waitErr instanceof Error ? waitErr.message : String(waitErr);
          if (
            !waitMsg.includes("WriteRfidFail") &&
            !waitMsg.includes("error 20")
          ) {
            throw waitErr;
          }
        }
      } finally {
        await globalClient.abstraction.printEnd().catch(() => {});
      }

      setStatus(s => ({ ...s, isPrinting: false }));
    } catch (err: unknown) {
      console.error("NIIMBOT print error:", err);
      const errorMsg = err instanceof Error ? err.message : "Print failed";

      if (
        errorMsg.includes("connect") ||
        errorMsg.includes("GATT") ||
        errorMsg.includes("Bluetooth") ||
        errorMsg.includes("cancel")
      ) {
        globalConnected = false;
        globalClient = null;
      }

      const isRfidError =
        errorMsg.includes("WriteRfidFail") || errorMsg.includes("error 20");
      const friendlyMsg = isRfidError
        ? t("labelPrint.rfidErrorDesc")
        : errorMsg;

      setStatus({
        isConnecting: false,
        isPrinting: false,
        error: friendlyMsg,
        connected: globalConnected,
      });

      setRememberMode(true);
      setPrintDialogError({
        isRfidError,
        message: friendlyMsg,
        rawError: errorMsg,
        qty: count,
      });
    }
  }, [barcodeValue, drawLabel, t]);

  const executeDevicePrint = useCallback(
    async (quantityToPrint: number = 1, forceSystemPrint = false) => {
      const count = Math.max(1, Math.min(1000, quantityToPrint));
      if (!barcodeValue) {
        setPrintDialogError({
          isRfidError: false,
          message: t("labelPrint.noBarcode"),
          qty: count,
        });
        return;
      }

      if (!forceSystemPrint) {
        try {
          const printer = await import("@/lib/printer");
          if (printer.isWebUsbSupported()) {
            const st = printer.getStatus();
            if (!st.connected) {
              const reconnected = await printer.autoReconnectPrinter();
              if (!reconnected) {
                await printer.connectPrinter();
              }
            }
            setStatus((s) => ({ ...s, isPrinting: true, error: null }));
            await printer.printLabel(
              {
                productName,
                price: productPrice,
                barcode: effectiveBarcode,
              },
              count
            );
            setStatus((s) => ({ ...s, isPrinting: false }));
            return;
          }
        } catch (usbErr: unknown) {
          setStatus((s) => ({ ...s, isPrinting: false }));
          const msg =
            usbErr instanceof Error
              ? usbErr.message
              : t("usbPrinter.deviceDisconnected");
          setPrintDialogError({
            isRfidError: false,
            isUsbFallbackAvailable: true,
            message: msg,
            qty: count,
          });
          return;
        }
      }

      try {
        setStatus((s) => ({ ...s, isPrinting: true, error: null }));
        await drawLabel();

        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not found");
        const dataUrl = canvas.toDataURL("image/png");

        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.setAttribute("aria-hidden", "true");
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || !iframe.contentWindow) {
          iframe.remove();
          throw new Error("Could not initialize device print frame.");
        }

        const labelsHtml = Array.from({ length: count })
          .map(
            () =>
              `<div class="label-page"><img src="${dataUrl}" alt="Barcode label" /></div>`
          )
          .join("");

        doc.open();
        doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print Label - ${productName.replace(/[<>&"]/g, "")}</title>
    <style>
      @page { size: 50mm 20mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; }
      .label-page {
        width: 50mm;
        height: 20mm;
        display: flex;
        align-items: center;
        justify-content: center;
        page-break-after: always;
        break-after: page;
        overflow: hidden;
      }
      .label-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: pixelated;
      }
    </style>
  </head>
  <body>${labelsHtml}</body>
</html>`);
        doc.close();

        const cleanup = () => {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 500);
        };

        const win = iframe.contentWindow;
        win.onafterprint = cleanup;

        setTimeout(() => {
          win.focus();
          win.print();
          setStatus((s) => ({ ...s, isPrinting: false }));
          setTimeout(cleanup, 60000);
        }, 150);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Device print failed";
        setStatus((s) => ({ ...s, isPrinting: false, error: errorMsg }));
        setPrintDialogError({
          isRfidError: false,
          message: t("labelPrint.printErrorTitle"),
          rawError: errorMsg,
          qty: count,
        });
      }
    },
    [barcodeValue, drawLabel, productName, t]
  );

  const handleOpenPrintModal = useCallback(() => {
    setShowModal(true);
  }, []);

  return (
    <>
      {children(handleOpenPrintModal, status)}

      {/* Print Quantity Selector Modal */}
      {showModal && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-left font-normal"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 flex flex-col items-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 rounded-full bg-[#f3f0ea] flex items-center justify-center mb-3">
              <span className="text-xl">🖨️</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center leading-snug">{productName}</h3>
            <p className="text-xs text-gray-400 mb-1">Price: TK {productPrice.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mb-5 font-mono">Barcode: {effectiveBarcode || "N/A"}</p>
            
            <label className="text-xs font-semibold text-gray-600 mb-2">Select Number of Copies</label>
            <div className="flex items-center space-x-3 mb-6 bg-gray-50 p-2 rounded-xl border border-gray-200 w-full justify-center">
              <button 
                type="button"
                onClick={() => setPrintQty(q => Math.max(1, q - 1))}
                className="w-11 h-11 rounded-lg bg-white shadow-sm border border-gray-200 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 text-lg"
              >
                -
              </button>
              <input 
                type="text"
                inputMode="numeric"
                value={printQtyInput}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const normalized = e.target.value
                    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
                    .replace(/[^0-9]/g, "");
                  setPrintQtyInput(normalized);
                }}
                onBlur={() => {
                  if (!printQtyInput || parseInt(printQtyInput, 10) < 1) {
                    setPrintQtyInput("1");
                  }
                }}
                className="w-20 min-h-[44px] text-center font-bold text-xl text-gray-900 bg-transparent focus:outline-none"
              />
              <button 
                type="button"
                onClick={() => setPrintQty(q => q + 1)}
                className="w-11 h-11 rounded-lg bg-white shadow-sm border border-gray-200 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 text-lg"
              >
                +
              </button>
            </div>

            {/* Quick preset buttons */}
            <div className="flex space-x-2 mb-5 w-full">
              {[1, 5, 10, 20, 50].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPrintQty(n)}
                  className={`flex-1 min-h-[40px] py-1.5 text-xs font-semibold rounded-lg border ${
                    printQty === n 
                      ? 'bg-black text-white border-black' 
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Printer Mode Selector (persisted in localStorage, defaults to Device Printer) */}
            <div
              className="w-full mb-5"
              style={{
                fontFamily:
                  "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
              }}
            >
              <label className="block text-xs font-semibold text-gray-600 mb-2 text-center">
                {t("labelPrint.printerMode")}
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => handleSelectPrinterMode("device")}
                  className={`min-h-[44px] px-2.5 py-2 rounded-lg text-[11px] font-bold transition-colors leading-tight ${
                    printerMode === "device"
                      ? "bg-black text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {t("labelPrint.devicePrinter")}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPrinterMode("bluetooth")}
                  className={`min-h-[44px] px-2.5 py-2 rounded-lg text-[11px] font-bold transition-colors leading-tight ${
                    printerMode === "bluetooth"
                      ? "bg-black text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {t("labelPrint.niimbotDirect")}
                </button>
              </div>
            </div>

            <div className="flex space-x-2 w-full">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => {
                  setShowModal(false);
                  if (printerMode === "device") {
                    executeDevicePrint(printQty);
                  } else {
                    executePrint(printQty);
                  }
                }}
                disabled={status.isConnecting || status.isPrinting}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl font-semibold text-sm bg-black text-white hover:bg-gray-800 transition-colors shadow-md flex items-center justify-center disabled:opacity-50"
              >
                {status.isPrinting ? "Printing..." : `Print ${printQty} ${printQty === 1 ? 'Label' : 'Labels'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: "-9999px",
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          width={384}
          height={160}
          style={{ background: "white" }}
        />
        <div ref={barcodeContainerRef}>
          {effectiveBarcode && (
            <Barcode
              value={effectiveBarcode}
              format="CODE128"
              width={1.8}
              height={55}
              fontSize={12}
              margin={4}
              displayValue={true}
              background="#ffffff"
              lineColor="#000000"
            />
          )}
        </div>
      </div>

      {/* Top-level Portal Error / RFID Fallback Dialog (never blurred, replaces alert()) */}
      {portalMounted &&
        printDialogError &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setPrintDialogError(null)}
            style={{
              zIndex: Z_INDEX.toast,
              fontFamily:
                "var(--font-noto-bengali), var(--font-geist-sans), sans-serif",
            }}
            className="fixed inset-0 flex items-center justify-center bg-black/55 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-gray-200 p-5 space-y-4"
            >
              <h3 className="text-base font-extrabold text-gray-900 leading-snug">
                {printDialogError.isRfidError
                  ? t("labelPrint.rfidFallbackTitle")
                  : t("labelPrint.printErrorTitle")}
              </h3>

              <p className="text-xs font-medium text-gray-600 leading-relaxed">
                {printDialogError.message}
              </p>

              {printDialogError.isRfidError && (
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMode}
                    onChange={(e) => setRememberMode(e.target.checked)}
                    className="w-4 h-4 accent-black rounded"
                  />
                  <span className="text-xs font-bold text-gray-800">
                    {t("labelPrint.rememberMode")}
                  </span>
                </label>
              )}

              {printDialogError.rawError && (
                <details className="text-xs bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
                  <summary className="font-bold text-gray-600 cursor-pointer select-none">
                    {t("labelPrint.details")}
                  </summary>
                  <p className="mt-1.5 font-mono text-[11px] text-red-700 break-words">
                    {printDialogError.rawError}
                  </p>
                </details>
              )}

              {printDialogError.isRfidError ? (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPrintDialogError(null)}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100"
                  >
                    {t("labelPrint.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const qtyToRetry = printDialogError.qty;
                      if (rememberMode) {
                        handleSelectPrinterMode("device");
                      }
                      setPrintDialogError(null);
                      void executeDevicePrint(qtyToRetry);
                    }}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800"
                  >
                    {t("labelPrint.printOnDevicePrinter")}
                  </button>
                </div>
              ) : printDialogError.isUsbFallbackAvailable ? (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPrintDialogError(null)}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100"
                  >
                    {t("labelPrint.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const qty = printDialogError.qty;
                      setPrintDialogError(null);
                      void executeDevicePrint(qty, true);
                    }}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800"
                  >
                    {t("usbPrinter.useSystemPrintFallback")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPrintDialogError(null)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800"
                >
                  {t("labelPrint.ok")}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

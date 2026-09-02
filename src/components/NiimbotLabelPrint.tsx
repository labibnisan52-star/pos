"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import Barcode from "react-barcode";

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

export default function NiimbotLabelPrint({
  productName,
  productPrice,
  barcodeValue,
  children,
}: NiimbotLabelPrintProps) {
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
  const [printQty, setPrintQty] = useState(1);

  const executePrint = useCallback(async (quantityToPrint: number = 1) => {
    if (!barcodeValue) {
      alert("This product does not have a barcode.");
      return;
    }

    if (!navigator.bluetooth) {
      alert("Web Bluetooth is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const count = Math.max(1, Math.min(1000, quantityToPrint));

    try {
      const { NiimbotBluetoothClient } = await import("@mmote/niimbluelib/dist/cjs/client/bluetooth_impl");
      const { ImageEncoder } = await import("@mmote/niimbluelib/dist/cjs/image_encoder");
      const { LabelType } = await import("@mmote/niimbluelib/dist/cjs/packets/index");

      if (!globalClient || !globalConnected) {
        setStatus(s => ({ ...s, isConnecting: true, error: null }));
        globalClient = new NiimbotBluetoothClient();
        await globalClient.connect();
        globalConnected = true;
        setStatus(s => ({ ...s, isConnecting: false, connected: true }));
        await globalClient.fetchPrinterInfo();
      }

      setStatus(s => ({ ...s, isPrinting: true, error: null }));

      await drawLabel();

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not found");

      const encodedImage = ImageEncoder.encodeCanvas(canvas, "top");
      const taskType = globalClient.getPrintTaskType() || "B1";

      const printTask = globalClient.abstraction.newPrintTask(taskType, {
        totalPages: count,
        density: 5,
        labelType: LabelType.WithGaps,
      });

      await printTask.printInit();
      for (let page = 1; page <= count; page++) {
        await printTask.printPage(encodedImage, page);
      }
      await printTask.waitForFinished();
      await globalClient.abstraction.printEnd();

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

      setStatus({
        isConnecting: false,
        isPrinting: false,
        error: errorMsg,
        connected: globalConnected,
      });

      alert(`Print failed: ${errorMsg}`);
    }
  }, [barcodeValue, drawLabel]);

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
                className="w-10 h-10 rounded-lg bg-white shadow-sm border border-gray-200 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 text-lg"
              >
                -
              </button>
              <input 
                type="number"
                min={1}
                max={500}
                value={printQty}
                onChange={e => setPrintQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 text-center font-bold text-xl text-gray-900 bg-transparent focus:outline-none"
              />
              <button 
                type="button"
                onClick={() => setPrintQty(q => q + 1)}
                className="w-10 h-10 rounded-lg bg-white shadow-sm border border-gray-200 flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100 text-lg"
              >
                +
              </button>
            </div>

            {/* Quick preset buttons */}
            <div className="flex space-x-2 mb-6 w-full">
              {[1, 5, 10, 20, 50].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPrintQty(n)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-md border ${
                    printQty === n 
                      ? 'bg-black text-white border-black' 
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex space-x-2 w-full">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => {
                  setShowModal(false);
                  executePrint(printQty);
                }}
                disabled={status.isConnecting || status.isPrinting}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-black text-white hover:bg-gray-800 transition-colors shadow-md flex items-center justify-center disabled:opacity-50"
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
    </>
  );
}

"use client";

import JsBarcode from "jsbarcode";
import { EscPosEncoder } from "./escpos";
import { canvasToEscPosRaster, ensureFontsReady } from "./raster";
import {
  DOTS_PER_MM,
  getPaperWidthDots,
  loadUsbPrinterSettings,
} from "./settings";
import { write } from "./webusb";

const BENGALI_FONT_STACK =
  "'Noto Sans Bengali', var(--font-noto-bengali), Arial, Helvetica, sans-serif";

export interface LabelPrintData {
  productName: string;
  price: number;
  barcode: string;
  sku?: string;
}

export function buildLabelCanvas(
  data: LabelPrintData,
  widthDots: number,
  heightDots: number
): HTMLCanvasElement {
  // Tuned for 50x15mm (384x120 dots) compact content; if canvas H > 120 (e.g. 27mm pitch),
  // keep printed content at 15mm (120 dots) so it stays compact and centered on the sticker.
  const W = Math.max(160, Math.ceil(widthDots / 8) * 8);
  const H = Math.max(80, Math.round(heightDots));
  const contentH = Math.min(H, 120);
  const topOffset = H > contentH ? Math.round((H - contentH) * 0.35) : 0;
  const scaleX = W / 384;
  const scaleY = contentH / 120;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";

  // 1. Top Center: Brand Name "RIZQ"
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `italic 900 ${Math.max(13, Math.round(16 * scaleY))}px 'Arial Black', Impact, sans-serif`;
  ctx.fillText("RIZQ", W / 2, topOffset + Math.round(2 * scaleY));

  // 2. Product Name (centered, single line)
  const maxTextWidth = W - Math.round(40 * scaleX);
  ctx.font = `bold ${Math.max(11, Math.round(12 * scaleY))}px ${BENGALI_FONT_STACK}`;
  ctx.fillText(
    data.productName,
    W / 2,
    topOffset + Math.round(20 * scaleY),
    maxTextWidth
  );

  // 3. Barcode Number (centered)
  const effectiveCode =
    data.barcode && data.barcode.length < 8
      ? data.barcode.padStart(8, "0")
      : data.barcode || "00000000";
  ctx.font = `bold ${Math.max(11, Math.round(12 * scaleY))}px monospace`;
  ctx.fillText(
    effectiveCode,
    W / 2,
    topOffset + Math.round(35 * scaleY),
    maxTextWidth
  );

  // 4. Price (centered)
  ctx.font = `bold ${Math.max(13, Math.round(15 * scaleY))}px Arial, Helvetica, sans-serif`;
  ctx.fillText(
    `TK ${data.price.toFixed(2)}`,
    W / 2,
    topOffset + Math.round(50 * scaleY),
    maxTextWidth
  );

  // 5. Bottom: Code128 Barcode bars (number already printed above)
  const barcodeY = topOffset + Math.round(68 * scaleY);
  const targetW = Math.round(240 * scaleX);
  const targetH = Math.max(
    Math.round(36 * scaleY),
    topOffset + contentH - barcodeY - Math.round(4 * scaleY)
  );
  const barcodeX = Math.round((W - targetW) / 2);

  const barcodeCanvas = document.createElement("canvas");
  try {
    JsBarcode(barcodeCanvas, effectiveCode, {
      format: "CODE128",
      width: 1.5,
      height: 44,
      displayValue: false,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });

    ctx.drawImage(barcodeCanvas, barcodeX, barcodeY, targetW, targetH);
  } catch {
    // Barcode number is already rendered above
  }

  return canvas;
}

export async function printLabelEscPos(
  data: LabelPrintData,
  copies?: number
): Promise<void> {
  await ensureFontsReady();

  const settings = loadUsbPrinterSettings();
  const count = Math.max(
    1,
    Math.min(100, Math.round(copies ?? settings.defaultCopies))
  );

  const paperMaxDots = getPaperWidthDots(settings.paperWidthMm);
  const labelWidthDots = Math.min(
    paperMaxDots,
    Math.ceil((settings.labelWidthMm * DOTS_PER_MM) / 8) * 8
  );
  const labelHeightDots = Math.round(settings.labelHeightMm * DOTS_PER_MM);
  const feedDots = Math.round(settings.labelFeedMm * DOTS_PER_MM);

  const canvas = buildLabelCanvas(data, labelWidthDots, labelHeightDots);
  const raster = canvasToEscPosRaster(canvas, { bandHeight: 128, threshold: 175 });

  const encoder = new EscPosEncoder().init().density(settings.density);

  for (let i = 0; i < count; i++) {
    encoder.raw(raster);
    if (feedDots > 0) {
      encoder.feedDots(feedDots);
    }
  }

  if (settings.cutAfterPrint) {
    encoder.cut(true);
  }

  await write(encoder.build());
}

/**
 * Prints a calibration border + 5mm tick ruler matching the configured labelWidthMm x labelHeightMm
 * so the user can tune label size and fixed feed on printers without a gap sensor.
 */
export async function printCalibrationLabelEscPos(): Promise<void> {
  await ensureFontsReady();

  const settings = loadUsbPrinterSettings();
  const paperMaxDots = getPaperWidthDots(settings.paperWidthMm);
  const W = Math.min(
    paperMaxDots,
    Math.ceil((settings.labelWidthMm * DOTS_PER_MM) / 8) * 8
  );
  const H = Math.max(96, Math.round(settings.labelHeightMm * DOTS_PER_MM));
  const feedDots = Math.round(settings.labelFeedMm * DOTS_PER_MM);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#000000";
  ctx.lineWidth = 2;

  // Outer border box
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // 5mm ruler ticks along top & left
  const tickStep = 5 * DOTS_PER_MM; // 40 dots = 5mm
  for (let x = tickStep; x < W - 4; x += tickStep) {
    ctx.beginPath();
    ctx.moveTo(x, 2);
    ctx.lineTo(x, 12);
    ctx.stroke();
  }
  for (let y = tickStep; y < H - 4; y += tickStep) {
    ctx.beginPath();
    ctx.moveTo(2, y);
    ctx.lineTo(12, y);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 16px Arial, Helvetica, sans-serif";
  ctx.fillText(
    `${settings.labelWidthMm}x${settings.labelHeightMm}mm`,
    W / 2,
    H / 2 - 12
  );
  ctx.font = "bold 13px Arial, Helvetica, sans-serif";
  ctx.fillText(`Feed: ${settings.labelFeedMm}mm`, W / 2, H / 2 + 12);

  const raster = canvasToEscPosRaster(canvas, { bandHeight: 128, threshold: 175 });
  const encoder = new EscPosEncoder()
    .init()
    .density(settings.density)
    .raw(raster)
    .feedDots(feedDots);

  await write(encoder.build());
}


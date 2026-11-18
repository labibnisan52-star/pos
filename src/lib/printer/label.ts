"use client";

import JsBarcode from "jsbarcode";
import { formatBDT } from "@/lib/calculations";
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
  const W = Math.max(160, Math.ceil(widthDots / 8) * 8);
  const H = Math.max(96, Math.round(heightDots));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";

  const pad = 8;

  // Top: Product name (wrapped/truncated)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `800 ${H >= 180 ? 20 : 16}px ${BENGALI_FONT_STACK}`;
  ctx.fillText(data.productName, W / 2, 6, W - pad * 2);

  // Middle: Code128 barcode via offscreen JsBarcode canvas
  const effectiveCode =
    data.barcode && data.barcode.length < 8
      ? data.barcode.padStart(8, "0")
      : data.barcode || "00000000";

  const barcodeCanvas = document.createElement("canvas");
  try {
    JsBarcode(barcodeCanvas, effectiveCode, {
      format: "CODE128",
      width: W >= 384 ? 2 : 1.6,
      height: Math.max(40, Math.round(H * 0.42)),
      displayValue: true,
      fontSize: 14,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });

    const targetW = Math.min(W - pad * 2, barcodeCanvas.width);
    const targetH = Math.min(Math.round(H * 0.54), barcodeCanvas.height);
    const bx = Math.round((W - targetW) / 2);
    const by = Math.round(H * 0.19);
    ctx.drawImage(barcodeCanvas, bx, by, targetW, targetH);
  } catch {
    ctx.font = "bold 16px monospace";
    ctx.fillText(effectiveCode, W / 2, Math.round(H * 0.4), W - pad * 2);
  }

  // Bottom row: SKU (left) + Price (right)
  const bottomY = H - 28;
  if (data.sku) {
    ctx.textAlign = "left";
    ctx.font = "bold 13px Arial, Helvetica, sans-serif";
    ctx.fillText(`SKU: ${data.sku}`, pad, bottomY + 3, W * 0.45);
  }

  ctx.textAlign = data.sku ? "right" : "center";
  ctx.font = `900 ${H >= 180 ? 22 : 18}px Arial, Helvetica, sans-serif`;
  ctx.fillText(
    `৳${formatBDT(data.price)}`,
    data.sku ? W - pad : W / 2,
    bottomY,
    W * 0.55
  );

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


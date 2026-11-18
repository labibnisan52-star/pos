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
  // Match the exact 50x20mm (384x160 dots) NIIMBOT label style & layout
  const W = Math.max(160, Math.ceil(widthDots / 8) * 8);
  const H = Math.max(96, Math.round(heightDots));
  const scaleX = W / 384;
  const scaleY = H / 160;

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
  ctx.font = `italic 900 ${Math.round(28 * scaleY)}px 'Arial Black', Impact, sans-serif`;
  ctx.fillText("RIZQ", W / 2, Math.round(4 * scaleY));

  // 2. Middle Row: Product Name (left) & Price (right)
  const rowY = Math.round(36 * scaleY);
  ctx.textAlign = "left";
  ctx.font = `bold ${Math.round(15 * scaleY)}px ${BENGALI_FONT_STACK}`;
  const maxTextWidth = W * 0.6;
  const words = data.productName.split(" ");
  let lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  lines = lines.slice(0, 2);

  const lineHeight = Math.round(17 * scaleY);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i],
      Math.round(12 * scaleX),
      rowY + i * lineHeight,
      maxTextWidth
    );
  }

  ctx.textAlign = "right";
  ctx.font = `bold ${Math.round(20 * scaleY)}px Arial, Helvetica, sans-serif`;
  ctx.fillText(
    `TK ${data.price.toFixed(2)}`,
    W - Math.round(12 * scaleX),
    rowY
  );

  // 3. Bottom: Code128 Barcode with number below
  const effectiveCode =
    data.barcode && data.barcode.length < 8
      ? data.barcode.padStart(8, "0")
      : data.barcode || "00000000";

  const barcodeY = Math.round((lines.length > 1 ? 72 : 60) * scaleY);
  const targetW = Math.round(300 * scaleX);
  const targetH = Math.max(
    Math.round(48 * scaleY),
    H - barcodeY - Math.round(4 * scaleY)
  );
  const barcodeX = Math.round((W - targetW) / 2);

  const barcodeCanvas = document.createElement("canvas");
  try {
    JsBarcode(barcodeCanvas, effectiveCode, {
      format: "CODE128",
      width: 2,
      height: 55,
      displayValue: true,
      fontSize: 14,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });

    ctx.drawImage(barcodeCanvas, barcodeX, barcodeY, targetW, targetH);
  } catch {
    ctx.textAlign = "center";
    ctx.font = "bold 16px monospace";
    ctx.fillText(effectiveCode, W / 2, barcodeY + Math.round(16 * scaleY), W - 24);
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


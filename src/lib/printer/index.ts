"use client";

import type {
  ReceiptOrderData,
  StorePrintSettings,
} from "@/components/ReceiptModal";
import { EscPosEncoder } from "./escpos";
import {
  printCalibrationLabelEscPos,
  printLabelEscPos,
  type LabelPrintData,
} from "./label";
import { canvasToEscPosRaster, ensureFontsReady } from "./raster";
import { printReceiptEscPos } from "./receipt";
import { getPaperWidthDots, loadUsbPrinterSettings } from "./settings";
import {
  autoReconnect,
  connect,
  disconnect,
  getPrinterStatus,
  isSupported,
  subscribePrinterStatus,
  write,
  type PrinterStatus,
} from "./webusb";

export type { LabelPrintData, PrinterStatus };

export function isWebUsbSupported(): boolean {
  return isSupported();
}

export async function connectPrinter(): Promise<PrinterStatus> {
  return connect();
}

export async function autoReconnectPrinter(): Promise<boolean> {
  return autoReconnect();
}

export async function disconnectPrinter(): Promise<void> {
  return disconnect();
}

export function getStatus(): PrinterStatus {
  return getPrinterStatus();
}

export function subscribeStatus(
  listener: (status: PrinterStatus) => void
): () => void {
  return subscribePrinterStatus(listener);
}

export async function printReceipt(
  order: ReceiptOrderData,
  storeSettings: StorePrintSettings
): Promise<void> {
  return printReceiptEscPos(order, storeSettings);
}

export async function printLabel(
  data: LabelPrintData,
  copies?: number
): Promise<void> {
  return printLabelEscPos(data, copies);
}

export async function printCalibrationLabel(): Promise<void> {
  return printCalibrationLabelEscPos();
}

export async function testPrint(): Promise<void> {
  await ensureFontsReady();
  const settings = loadUsbPrinterSettings();
  const W = getPaperWidthDots(settings.paperWidthMm);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 170;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, 170);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.font =
    "900 24px 'Noto Sans Bengali', var(--font-noto-bengali), Arial, sans-serif";
  ctx.fillText("RIZQ POS — টেস্ট প্রিন্ট", W / 2, 14, W - 20);

  ctx.font =
    "600 15px 'Noto Sans Bengali', var(--font-noto-bengali), Arial, sans-serif";
  ctx.fillText("WebUSB ESC/POS প্রিন্টার সংযুক্ত!", W / 2, 52, W - 20);
  ctx.fillText(
    `Paper: ${settings.paperWidthMm}mm (${W} dots) • Density: ${settings.density}`,
    W / 2,
    80,
    W - 20
  );
  ctx.fillText(new Date().toLocaleString(), W / 2, 110, W - 20);

  const raster = canvasToEscPosRaster(canvas, { bandHeight: 128, threshold: 175 });
  const encoder = new EscPosEncoder()
    .init()
    .density(settings.density)
    .raw(raster)
    .feedLines(settings.receiptExtraFeedLines);

  await write(encoder.build());
}


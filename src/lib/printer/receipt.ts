"use client";

import { calculateLineTotal, formatBDT } from "@/lib/calculations";
import type {
  ReceiptOrderData,
  StorePrintSettings,
} from "@/components/ReceiptModal";
import { EscPosEncoder } from "./escpos";
import { canvasToEscPosRaster, ensureFontsReady } from "./raster";
import { getPaperWidthDots, loadUsbPrinterSettings } from "./settings";
import { write } from "./webusb";

const BENGALI_FONT_STACK =
  "'Noto Sans Bengali', var(--font-noto-bengali), Arial, Helvetica, sans-serif";

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function buildReceiptCanvas(
  order: ReceiptOrderData,
  storeSettings: StorePrintSettings,
  paperWidthDots: number
): HTMLCanvasElement {
  const W = paperWidthDots;
  const padX = 10;
  const scale = W >= 576 ? 1.25 : 1;

  // Estimate generous max height, then crop tightly after drawing
  const estimatedH = Math.max(
    420,
    Math.round((280 + order.items.length * 52) * scale)
  );

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = estimatedH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, estimatedH);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = Math.round(12 * scale);

  // Shop header
  ctx.textAlign = "center";
  ctx.font = `900 ${Math.round(24 * scale)}px ${BENGALI_FONT_STACK}`;
  ctx.fillText(storeSettings.shopName || "RIZQ", W / 2, y, W - padX * 2);
  y += Math.round(30 * scale);

  if (storeSettings.shopAddress) {
    ctx.font = `600 ${Math.round(14 * scale)}px ${BENGALI_FONT_STACK}`;
    for (const line of wrapText(ctx, storeSettings.shopAddress, W - padX * 2)) {
      ctx.fillText(line, W / 2, y);
      y += Math.round(18 * scale);
    }
  }

  if (storeSettings.shopPhone) {
    ctx.font = `600 ${Math.round(14 * scale)}px ${BENGALI_FONT_STACK}`;
    ctx.fillText(`Tel: ${storeSettings.shopPhone}`, W / 2, y, W - padX * 2);
    y += Math.round(20 * scale);
  }

  const drawDivider = () => {
    y += 4;
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.moveTo(padX, y);
    ctx.lineTo(W - padX, y);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    y += 10;
  };

  drawDivider();

  const shortOrderNo =
    "#" +
    order.id
      .replace(/^offline-/, "OFF-")
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase();

  const dateStr = new Date(order.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = new Date(order.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const drawRow = (left: string, right: string, bold = false, size = 15) => {
    const px = Math.round(size * scale);
    ctx.font = `${bold ? "800" : "600"} ${px}px ${BENGALI_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.fillText(left, padX, y, W * 0.56);
    ctx.textAlign = "right";
    ctx.fillText(right, W - padX, y, W * 0.4);
    y += Math.round((size + 7) * scale);
  };

  drawRow("Invoice:", shortOrderNo, true, 15);
  drawRow("Date:", `${dateStr} ${timeStr}`, false, 14);
  if (order.customer_name) {
    drawRow("Customer:", order.customer_name, false, 14);
  }
  drawRow("Payment:", order.payment_method, false, 14);

  drawDivider();

  // Items
  for (const item of order.items) {
    const lineTotal =
      item.line_total !== undefined
        ? item.line_total
        : calculateLineTotal(item.unit_price, item.quantity);

    const itemTitle = item.variant_label
      ? `${item.name} (${item.variant_label})`
      : item.name;

    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(15 * scale)}px ${BENGALI_FONT_STACK}`;
    for (const line of wrapText(ctx, itemTitle, W - padX * 2)) {
      ctx.fillText(line, padX, y);
      y += Math.round(19 * scale);
    }

    drawRow(
      `  ${item.quantity} × ৳${formatBDT(item.unit_price)}`,
      `৳${formatBDT(lineTotal)}`,
      false,
      14
    );
  }

  drawDivider();

  // Totals
  drawRow("সাবটোটাল (Subtotal)", `৳${formatBDT(order.subtotal)}`, false, 15);
  if (order.discount_amount > 0) {
    drawRow("Discount", `-৳${formatBDT(order.discount_amount)}`, false, 15);
  }
  drawRow("সর্বমোট", `৳${formatBDT(order.grand_total)}`, true, 18);
  y += 2;
  drawRow("প্রাপ্ত টাকা", `৳${formatBDT(order.amount_received)}`, false, 15);
  if (order.change > 0) {
    drawRow("ফেরত দিতে হবে", `৳${formatBDT(order.change)}`, false, 15);
  }
  if (order.due_amount > 0) {
    drawRow("বাকি টাকা", `৳${formatBDT(order.due_amount)}`, true, 15);
  }

  drawDivider();

  if (storeSettings.receiptFooter) {
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(14 * scale)}px ${BENGALI_FONT_STACK}`;
    for (const line of wrapText(ctx, storeSettings.receiptFooter, W - padX * 2)) {
      ctx.fillText(line, W / 2, y);
      y += Math.round(19 * scale);
    }
  }

  const finalH = Math.min(estimatedH, y + Math.round(16 * scale));
  const cropped = document.createElement("canvas");
  cropped.width = W;
  cropped.height = finalH;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) return canvas;
  croppedCtx.fillStyle = "#ffffff";
  croppedCtx.fillRect(0, 0, W, finalH);
  croppedCtx.drawImage(canvas, 0, 0, W, finalH, 0, 0, W, finalH);
  return cropped;
}

export async function printReceiptEscPos(
  order: ReceiptOrderData,
  storeSettings: StorePrintSettings
): Promise<void> {
  await ensureFontsReady();

  const settings = loadUsbPrinterSettings();
  const paperWidthDots = getPaperWidthDots(settings.paperWidthMm);
  const canvas = buildReceiptCanvas(order, storeSettings, paperWidthDots);
  const raster = canvasToEscPosRaster(canvas, { bandHeight: 128, threshold: 175 });

  const encoder = new EscPosEncoder()
    .init()
    .density(settings.density)
    .raw(raster)
    .feedLines(settings.receiptExtraFeedLines);

  if (settings.cutAfterPrint) {
    encoder.cut(true);
  }
  if (settings.openCashDrawer) {
    encoder.cashDrawerPulse(0);
  }

  await write(encoder.build());
}


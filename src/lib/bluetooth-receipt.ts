"use client";

import type { NiimbotAbstractClient } from "@mmote/niimbluelib";
import { calculateLineTotal, formatBDT } from "@/lib/calculations";
import type {
  ReceiptOrderData,
  StorePrintSettings,
} from "@/components/ReceiptModal";

let receiptBtClient: NiimbotAbstractClient | null = null;
let receiptBtConnected = false;

/**
 * Draws a crisp 384px-wide (203 DPI / 48mm) monochrome thermal receipt onto a canvas
 * for direct printing on the NIIMBOT Bluetooth printer.
 */
function renderReceiptToCanvas(
  order: ReceiptOrderData,
  settings: StorePrintSettings,
  shortOrderNo: string
): HTMLCanvasElement {
  const W = 384;
  const lineH = 22;
  const paddingX = 10;

  // Estimate dynamic height
  const itemRows = order.items.length;
  const estimatedHeight = Math.max(
    360,
    240 + itemRows * 40 + (order.discount_amount > 0 ? 24 : 0) + (order.due_amount > 0 ? 24 : 0)
  );

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = estimatedHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, estimatedHeight);
  ctx.fillStyle = "#000000";

  let y = 14;

  // Shop header
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "900 24px Arial, Helvetica, sans-serif";
  ctx.fillText(settings.shopName || "RIZQ", W / 2, y, W - 20);
  y += 30;

  if (settings.shopAddress) {
    ctx.font = "600 14px Arial, Helvetica, sans-serif";
    ctx.fillText(settings.shopAddress, W / 2, y, W - 20);
    y += 18;
  }
  if (settings.shopPhone) {
    ctx.font = "600 14px Arial, Helvetica, sans-serif";
    ctx.fillText(`Tel: ${settings.shopPhone}`, W / 2, y, W - 20);
    y += 20;
  }

  // Dashed divider
  const drawDivider = () => {
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.moveTo(paddingX, y);
    ctx.lineTo(W - paddingX, y);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    y += 10;
  };

  drawDivider();

  // Order metadata
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
    ctx.font = `${bold ? "bold" : "normal"} ${size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(left, paddingX, y, W * 0.58);
    ctx.textAlign = "right";
    ctx.fillText(right, W - paddingX, y, W * 0.38);
    y += lineH;
  };

  drawRow("Invoice:", shortOrderNo, true, 15);
  drawRow("Date:", `${dateStr} ${timeStr}`, false, 14);
  if (order.customer_name) {
    drawRow("Customer:", order.customer_name, false, 14);
  }
  drawRow("Payment:", order.payment_method, false, 14);

  y += 2;
  drawDivider();

  // Items
  for (const item of order.items) {
    const lineTotal =
      item.line_total !== undefined
        ? item.line_total
        : calculateLineTotal(item.unit_price, item.quantity);

    ctx.textAlign = "left";
    ctx.font = "bold 15px Arial, Helvetica, sans-serif";
    const label = item.variant_label
      ? `${item.name} (${item.variant_label})`
      : item.name;
    ctx.fillText(label, paddingX, y, W - paddingX * 2);
    y += 19;

    drawRow(
      `${item.quantity} x TK ${formatBDT(item.unit_price)}`,
      `TK ${formatBDT(lineTotal)}`,
      false,
      14
    );
  }

  y += 2;
  drawDivider();

  // Totals
  drawRow("Subtotal", `TK ${formatBDT(order.subtotal)}`, false, 15);
  if (order.discount_amount > 0) {
    drawRow("Discount", `-TK ${formatBDT(order.discount_amount)}`, false, 15);
  }
  drawRow("GRAND TOTAL", `TK ${formatBDT(order.grand_total)}`, true, 18);
  y += 4;
  drawRow("Paid", `TK ${formatBDT(order.amount_received)}`, false, 15);
  if (order.change > 0) {
    drawRow("Change", `TK ${formatBDT(order.change)}`, false, 15);
  }
  if (order.due_amount > 0) {
    drawRow("Due", `TK ${formatBDT(order.due_amount)}`, true, 15);
  }

  y += 4;
  drawDivider();

  if (settings.receiptFooter) {
    ctx.textAlign = "center";
    ctx.font = "bold 14px Arial, Helvetica, sans-serif";
    ctx.fillText(settings.receiptFooter, W / 2, y, W - 20);
    y += 24;
  }

  // Crop canvas to exact used height
  const finalHeight = Math.min(estimatedHeight, y + 12);
  const cropped = document.createElement("canvas");
  cropped.width = W;
  cropped.height = finalHeight;
  const croppedCtx = cropped.getContext("2d");
  if (croppedCtx) {
    croppedCtx.fillStyle = "#ffffff";
    croppedCtx.fillRect(0, 0, W, finalHeight);
    croppedCtx.drawImage(canvas, 0, 0, W, finalHeight, 0, 0, W, finalHeight);
    return cropped;
  }

  return canvas;
}

export async function printReceiptViaBluetooth(
  order: ReceiptOrderData,
  settings: StorePrintSettings,
  shortOrderNo: string
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.bluetooth) {
    throw new Error(
      "Web Bluetooth is not supported in this browser. Please use Chrome or Edge."
    );
  }

  const { NiimbotBluetoothClient } = await import(
    "@mmote/niimbluelib/dist/cjs/client/bluetooth_impl"
  );
  const { ImageEncoder } = await import(
    "@mmote/niimbluelib/dist/cjs/image_encoder"
  );
  const { LabelType } = await import(
    "@mmote/niimbluelib/dist/cjs/packets/index"
  );

  try {
    if (!receiptBtClient || !receiptBtConnected) {
      receiptBtClient = new NiimbotBluetoothClient();
      await receiptBtClient.connect();
      receiptBtConnected = true;
      await receiptBtClient.fetchPrinterInfo();
    }

    const canvas = renderReceiptToCanvas(order, settings, shortOrderNo);
    const encodedImage = ImageEncoder.encodeCanvas(canvas, "top");
    const taskType = receiptBtClient.getPrintTaskType() || "B1";

    const printTask = receiptBtClient.abstraction.newPrintTask(taskType, {
      totalPages: 1,
      density: 5,
      labelType: LabelType.Continuous,
    });

    await printTask.printInit();
    await printTask.printPage(encodedImage, 1);
    await printTask.waitForFinished();
    await receiptBtClient.abstraction.printEnd();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Bluetooth print failed";
    if (
      msg.includes("connect") ||
      msg.includes("GATT") ||
      msg.includes("Bluetooth") ||
      msg.includes("cancel")
    ) {
      receiptBtConnected = false;
      receiptBtClient = null;
    }
    throw err;
  }
}


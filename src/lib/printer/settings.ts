export interface UsbPrinterSettings {
  paperWidthMm: 58 | 80;
  /** 0 - 15 density level */
  density: number;
  labelWidthMm: number;
  labelHeightMm: number;
  receiptExtraFeedLines: number;
  /** Fixed feed in mm after each label (587CII has no gap sensor) */
  labelFeedMm: number;
  defaultCopies: number;
  /** Disabled by default (587CII has no auto-cutter) */
  cutAfterPrint: boolean;
  /** Optional cash drawer kick pulse */
  openCashDrawer: boolean;
}

export const DOTS_PER_MM = 8; // ~203 DPI

export const DEFAULT_USB_PRINTER_SETTINGS: UsbPrinterSettings = {
  paperWidthMm: 58,
  density: 10,
  labelWidthMm: 50,
  labelHeightMm: 20,
  receiptExtraFeedLines: 4,
  labelFeedMm: 7,
  defaultCopies: 1,
  cutAfterPrint: false,
  openCashDrawer: false,
};

const STORAGE_KEY = "rizq_usb_printer_settings_v5";

export function getPaperWidthDots(paperWidthMm: 58 | 80): number {
  return paperWidthMm === 80 ? 576 : 384;
}

export function loadUsbPrinterSettings(): UsbPrinterSettings {
  if (typeof window === "undefined") return DEFAULT_USB_PRINTER_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USB_PRINTER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UsbPrinterSettings>;
    return {
      paperWidthMm: parsed.paperWidthMm === 80 ? 80 : 58,
      density: clampNumber(parsed.density, 0, 15, DEFAULT_USB_PRINTER_SETTINGS.density),
      labelWidthMm: clampNumber(parsed.labelWidthMm, 20, 80, DEFAULT_USB_PRINTER_SETTINGS.labelWidthMm),
      labelHeightMm: clampNumber(parsed.labelHeightMm, 12, 100, DEFAULT_USB_PRINTER_SETTINGS.labelHeightMm),
      receiptExtraFeedLines: clampNumber(
        parsed.receiptExtraFeedLines,
        0,
        12,
        DEFAULT_USB_PRINTER_SETTINGS.receiptExtraFeedLines
      ),
      labelFeedMm: clampNumber(parsed.labelFeedMm, 0, 30, DEFAULT_USB_PRINTER_SETTINGS.labelFeedMm),
      defaultCopies: clampNumber(parsed.defaultCopies, 1, 100, DEFAULT_USB_PRINTER_SETTINGS.defaultCopies),
      cutAfterPrint: Boolean(parsed.cutAfterPrint),
      openCashDrawer: Boolean(parsed.openCashDrawer),
    };
  } catch {
    return DEFAULT_USB_PRINTER_SETTINGS;
  }
}

export function saveUsbPrinterSettings(
  next: Partial<UsbPrinterSettings>
): UsbPrinterSettings {
  const merged: UsbPrinterSettings = {
    ...loadUsbPrinterSettings(),
    ...next,
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage quota errors
    }
  }
  return merged;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}


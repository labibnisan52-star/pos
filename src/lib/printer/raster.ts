"use client";

/**
 * Ensures web fonts (including Noto Sans Bengali) are ready before drawing on canvas.
 */
export async function ensureFontsReady(): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font loading warnings
    }
  }
}

export interface RasterEncodeOptions {
  /** Number of pixel rows per GS v 0 band to avoid overflowing printer RAM */
  bandHeight?: number;
  /** Luminance threshold (0..255). Pixels darker than threshold become black dots. */
  threshold?: number;
  /** Enable Floyd-Steinberg dithering for images/logos */
  dither?: boolean;
}

/**
 * Converts an HTMLCanvasElement to 1-bit monochrome GS v 0 ESC/POS raster bands.
 * Width is padded/aligned to a multiple of 8 dots (384 for 58mm, 576 for 80mm).
 */
export function canvasToEscPosRaster(
  canvas: HTMLCanvasElement,
  options?: RasterEncodeOptions
): Uint8Array {
  const bandHeight = Math.max(24, Math.min(256, options?.bandHeight ?? 128));
  const threshold = options?.threshold ?? 175;
  const dither = options?.dither ?? false;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const width = canvas.width;
  const height = canvas.height;
  const widthBytes = Math.ceil(width / 8);

  const imgData = ctx.getImageData(0, 0, width, height);
  const rgba = imgData.data;

  // Build luminance buffer (0 = black, 255 = white)
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const a = rgba[idx + 3] / 255;
    // Composite over white background
    const r = rgba[idx] * a + 255 * (1 - a);
    const g = rgba[idx + 1] * a + 255 * (1 - a);
    const b = rgba[idx + 2] * a + 255 * (1 - a);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  if (dither) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const oldVal = lum[i];
        const newVal = oldVal < threshold ? 0 : 255;
        const err = oldVal - newVal;
        lum[i] = newVal;

        if (x + 1 < width) lum[i + 1] += (err * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) lum[i + width - 1] += (err * 3) / 16;
          lum[i + width] += (err * 5) / 16;
          if (x + 1 < width) lum[i + width + 1] += (err * 1) / 16;
        }
      }
    }
  }

  const outChunks: number[] = [];

  for (let yStart = 0; yStart < height; yStart += bandHeight) {
    const rows = Math.min(bandHeight, height - yStart);
    const xL = widthBytes & 0xff;
    const xH = (widthBytes >> 8) & 0xff;
    const yL = rows & 0xff;
    const yH = (rows >> 8) & 0xff;

    // GS v 0 m xL xH yL yH [d1...dk]
    outChunks.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    for (let dy = 0; dy < rows; dy++) {
      const y = yStart + dy;
      for (let bx = 0; bx < widthBytes; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < width && lum[y * width + x] < threshold) {
            byte |= 1 << (7 - bit);
          }
        }
        outChunks.push(byte);
      }
    }
  }

  return new Uint8Array(outChunks);
}


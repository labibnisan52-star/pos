/**
 * Lightweight zero-dependency ESC/POS command builder.
 */
export type EscPosAlign = "left" | "center" | "right";

export class EscPosEncoder {
  private chunks: number[] = [];

  /** ESC @ — Initialize printer */
  init(): this {
    this.chunks.push(0x1b, 0x40);
    return this;
  }

  /** ESC a n — Select justification */
  align(mode: EscPosAlign): this {
    const code = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    this.chunks.push(0x1b, 0x61, code);
    return this;
  }

  /** ESC E n — Emphasized (bold) mode */
  bold(enabled: boolean): this {
    this.chunks.push(0x1b, 0x45, enabled ? 1 : 0);
    return this;
  }

  /** GS ! n — Select character size (1..8 width/height multiplier) */
  textSize(widthMul = 1, heightMul = 1): this {
    const w = Math.max(0, Math.min(7, widthMul - 1));
    const h = Math.max(0, Math.min(7, heightMul - 1));
    this.chunks.push(0x1d, 0x21, (w << 4) | h);
    return this;
  }

  /** ESC d n — Print and feed n lines */
  feedLines(lines: number): this {
    const count = Math.max(0, Math.min(255, Math.round(lines)));
    if (count > 0) {
      this.chunks.push(0x1b, 0x64, count);
    }
    return this;
  }

  /** ESC J n — Print and feed paper n dots (~0.125mm per dot at 203 dpi) */
  feedDots(dots: number): this {
    let remaining = Math.max(0, Math.round(dots));
    while (remaining > 0) {
      const step = Math.min(255, remaining);
      this.chunks.push(0x1b, 0x4a, step);
      remaining -= step;
    }
    return this;
  }

  /**
   * ESC 7 n1 n2 n3 — Heating time / print density (supported on many 58mm ESC/POS printers).
   * Safe fallback: ignored by printers that do not implement ESC 7.
   */
  density(level: number): this {
    const clamped = Math.max(0, Math.min(15, Math.round(level)));
    const heatTime = 60 + clamped * 10; // 60..210 (units of 10us)
    this.chunks.push(0x1b, 0x37, 7, Math.min(255, heatTime), 2);
    return this;
  }

  /** GS V m n — Paper cut (disabled by default for printers without a cutter) */
  cut(partial = true): this {
    this.chunks.push(0x1d, 0x56, partial ? 66 : 65, 0);
    return this;
  }

  /** ESC p m t1 t2 — Cash drawer kick pulse */
  cashDrawerPulse(pin: 0 | 1 = 0): this {
    this.chunks.push(0x1b, 0x70, pin, 25, 250);
    return this;
  }

  /** Append raw ESC/POS bytes (e.g. GS v 0 raster bands) */
  raw(bytes: Uint8Array): this {
    for (let i = 0; i < bytes.length; i++) {
      this.chunks.push(bytes[i]);
    }
    return this;
  }

  /** Append ASCII text + LF */
  textLine(text: string): this {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      this.chunks.push(code >= 32 && code <= 126 ? code : 0x3f);
    }
    this.chunks.push(0x0a);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}


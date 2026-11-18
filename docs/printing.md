# Direct USB Thermal Printing (WebUSB ESC/POS)

Rizq POS prints receipts and product barcode labels directly from **Chrome / Edge** to USB ESC/POS thermal printers (such as **Model 587CII** / *Artery CMD:ESCPO USB Printer*, 58mm, ~203 dpi / 384 dots) using **WebUSB**, bypassing macOS CUPS and avoiding paused/infinite print jobs.

---

## 1. Requirements
- **Browser**: Google Chrome or Microsoft Edge (desktop or Android). Safari and Firefox do not support WebUSB.
- **Origin**: Must be served over `https://` (Vercel) or `http://localhost`.

---

## 2. macOS Setup (Important!)
On macOS, if the printer is added to **System Settings > Printers & Scanners**, CUPS claims the USB interface in the background and Chrome will fail with *"প্রিন্টার ইন্টারফেস দখল করা যায়নি" (Unable to claim interface)*.

1. Open **System Settings > Printers & Scanners**.
2. Select your 58mm thermal printer (e.g., *Generic* / *587CII* / *Artery*) and click **Remove Printer**.
3. Unplug the USB cable from your Mac and plug it back in.
4. Close any other apps or browser tabs that might be holding the printer.

---

## 3. Connecting & Testing
1. Go to **Dashboard → Settings → USB থার্মাল প্রিন্টার (ESC/POS)**.
2. Click **প্রিন্টার সংযোগ করুন** (*Connect Printer*).
3. Select your printer (e.g., *Artery CMD:ESCPO USB Printer*) in Chrome's USB picker and click **Connect**.
   - Once permitted, the app auto-reconnects on future visits without prompting.
4. Click **টেস্ট প্রিন্ট** (*Test Print*) to verify Bangla + English raster printing.

---

## 4. Calibrating Label Size & Feed (No Gap Sensor)
Because Model 587CII is a receipt printer without a label gap sensor or auto-cutter:
1. In **Settings → USB থার্মাল প্রিন্টার (ESC/POS)**, set:
   - **Paper Width**: `58mm` (`384` dots) or `80mm` (`576` dots)
   - **Label Width (mm)** & **Label Height (mm)** (e.g. `48` × `25`)
   - **Feed After Each Label (mm)** (e.g. `4` mm)
2. Click **ক্যালিব্রেশন বক্স** (*Calibration Box*). It prints a border box with `5mm` ruler ticks.
3. Measure where the next label starts and adjust **Feed After Each Label (mm)** up or down by `0.5–1mm` until multi-copy labels align cleanly.

---

## 5. Troubleshooting
- **"Unable to claim interface" / "প্রিন্টার ইন্টারফেস দখল করা যায়নি"**:
  - Remove the printer from macOS **System Settings > Printers & Scanners**, unplug & replug USB, and close other tabs/apps.
- **Browser does not support WebUSB**:
  - Switch to Chrome or Edge, or use the **সিস্টেম প্রিন্ট ব্যবহার করুন (ফলব্যাক)** (`window.print()`) button shown in the print dialog.
- **Print looks too light or too dark**:
  - Adjust **প্রিন্ট ঘনত্ব** (*Print Density*, `0–15`) in Settings.
- **Bangla text looks missing or broken**:
  - Ensure the page has finished loading fonts (`Noto Sans Bengali`); the rasterizer automatically waits for `document.fonts.ready` before drawing to canvas.

